import * as ts from 'typescript';

import {
  apply,
  branchAndMerge,
  chain,
  filter,
  MergeStrategy,
  mergeWith,
  move,
  noop,
  Rule,
  SchematicContext,
  SchematicsException,
  template,
  Tree,
  url
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';

import {
  buildDefaultPath,
  getWorkspace
} from '@schematics/angular/utility/workspace';
import { parseName } from '@schematics/angular/utility/parse-name';
import { InsertChange } from '@schematics/angular/utility/change';
import { buildRelativePath } from '@schematics/angular/utility/find-module';
import { addProviderToModule } from '@schematics/angular/utility/ast-utils';

import { Schema as ModelServiceOptions } from './schema';

export default function (options: ModelServiceOptions): any {
  return async (host: Tree, _context: SchematicContext) => {
    const workspace = await getWorkspace(host);
    const projectName =
      options.project || workspace.projects.keys().next().value;
    const project = workspace.projects.get(projectName);

    if (options.path === undefined && project) {
      options.path = buildDefaultPath(project);
    }

    const parsedPath = parseName(options.path as string, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path;

    const templateSource = apply(url('./files'), [
      options.spec ? noop() : filter((path) => !path.endsWith('.spec.ts')),
      template({
        ...strings,
        'if-flat': (s: string) => (options.flat ? '' : s),
        ...options
      }),
      move(parsedPath.path)
    ]);

    return chain([
      branchAndMerge(
        chain([
          addToNgModuleProviders(options),
          mergeWith(templateSource, MergeStrategy.Default)
        ])
      ),
      noop()
    ]);
  };
}

function addToNgModuleProviders(options: ModelServiceOptions): Rule {
  return (host: Tree) => {
    if (!options.module) {
      return host;
    }

    const modulePath = `${options.path}/${options.module}`;
    const moduleSource = readIntoSourceFile(host, modulePath);

    const servicePath =
      `${options.path}/` +
      (options.flat ? '' : strings.dasherize(options.name) + '/') +
      strings.dasherize(options.name) +
      '.service';

    const relativePath = buildRelativePath(modulePath, servicePath);
    const classifiedName = strings.classify(`${options.name}Service`);
    const providersChanges = addProviderToModule(
      moduleSource,
      modulePath,
      classifiedName,
      relativePath
    );

    const providersRecorder = host.beginUpdate(modulePath);
    for (const change of providersChanges) {
      if (change instanceof InsertChange) {
        providersRecorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(providersRecorder);

    return host;
  };
}

function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
  const text = host.read(modulePath);
  if (text === null) {
    throw new SchematicsException(`File ${modulePath} does not exist.`);
  }
  const sourceText = text.toString('utf-8');

  return ts.createSourceFile(
    modulePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}


