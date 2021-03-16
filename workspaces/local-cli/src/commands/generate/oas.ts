import Command, { flags } from '@oclif/command';
import { getPathsRelativeToConfig } from '@useoptic/cli-config';
import { IPathMapping } from '@useoptic/cli-config';
import { OasProjectionHelper } from '@useoptic/domain';
import { cli } from 'cli-ux';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { fromOptic } from '@useoptic/cli-shared';
import * as DiffEngine from '@useoptic/diff-engine';

export default class GenerateOas extends Command {
  static description = 'export an OpenAPI 3.0.1 spec';

  static flags = {
    json: flags.boolean({}),
    yaml: flags.boolean({}),
  };

  async run() {
    const { flags } = this.parse(GenerateOas);
    await generateOas(
      flags.yaml || (!flags.json && !flags.yaml) /* make this default */,
      flags.json
    );
  }
}

export async function generateOas(
  flagYaml: boolean,
  flagJson: boolean
): Promise<{ json: string | undefined; yaml: string | undefined } | undefined> {
  try {
    const paths = await getPathsRelativeToConfig();
    const { specDirPath } = paths;
    try {
      const events = await getStream(
        DiffEngine.readSpec({
          specDirPath,
        })
      );

      const parsedOas = OasProjectionHelper.fromEventString(events);

      const outputFiles = await emit(paths, parsedOas, flagYaml, flagJson);
      const filePaths = Object.values(outputFiles);
      console.log(
        '\n' +
          fromOptic(
            `Generated OAS file${filePaths.length > 1 && 's'}` +
              filePaths.join('\n')
          )
      );

      return outputFiles;
    } catch (e) {
      console.error(e);
    }
  } catch (e) {
    console.error(e);
  }
}

export async function emit(
  paths: IPathMapping,
  parsedOas: object,
  flagYaml: boolean,
  flagJson: boolean
): Promise<{ json: string | undefined; yaml: string | undefined }> {
  const shouldOutputYaml = flagYaml;
  const shouldOutputJson = flagJson;

  const outputPath = path.join(paths.basePath, 'generated');

  let yamlPath, jsonPath;

  await fs.ensureDir(outputPath);
  if (shouldOutputYaml) {
    const outputFile = path.join(outputPath, 'openapi.yaml');
    await fs.writeFile(outputFile, yaml.safeDump(parsedOas, { indent: 1 }));
    yamlPath = outputFile;
  }
  if (shouldOutputJson) {
    const outputFile = path.join(outputPath, 'openapi.json');
    await fs.writeJson(outputFile, parsedOas, { spaces: 2 });
    jsonPath = outputFile;
  }

  return {
    json: jsonPath,
    yaml: yamlPath,
  };
}

async function getStream(stream: any) {
  const chunks: Buffer[] = [];
  for await (let chunk of stream) {
    chunks.push(chunk); // should already be a Buffer
  }
  return Buffer.concat(chunks).toString();
}
