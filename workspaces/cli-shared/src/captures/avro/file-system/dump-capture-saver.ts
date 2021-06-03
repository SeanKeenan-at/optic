import fs from 'fs-extra';
import path from 'path';
//@ts-ignore
import oboe from 'oboe';
import { CaptureSaver } from './capture-saver';
import { IHttpInteraction } from '@useoptic/optic-domain';

async function main(
  inputFilePath: string,
  outputBaseDirectory: string,
  repeatSampleTimes: string = '1',
  captureId: string = 'ccc'
) {
  console.log({ inputFilePath });
  const input = fs.createReadStream(inputFilePath);
  const repeatSampleCount = isNaN(parseInt(repeatSampleTimes))
    ? 1
    : parseInt(repeatSampleTimes);
  const events: any[] = [];
  const captureBaseDirectory = path.join(
    outputBaseDirectory,
    '.optic',
    'captures'
  );
  const captureSaver = new CaptureSaver({
    captureBaseDirectory,
    captureId,
  });
  await captureSaver.init();
  await new Promise((resolve, reject) => {
    oboe(input)
      .on('node', {
        // @ts-ignore
        'events.*': function (event: any) {
          console.count('event');
          //console.log({ event });
          events.push(event);
        },
        'session.samples.*': function (sample: IHttpInteraction) {
          for (var i = 0; i < repeatSampleCount; i++) {
            console.count('sample');
            //console.log({ sample });
            captureSaver.save(sample);
          }
        },
      })
      .on('done', function () {
        console.log('done');
        resolve();
      })
      .on('fail', function (e: any) {
        console.error(e);
        reject(e);
      });
  });

  const files = [
    {
      location: path.join(outputBaseDirectory, 'optic.yml'),
      contents: `name: ${JSON.stringify(path.basename(inputFilePath))}`,
    },
    {
      location: path.join(
        outputBaseDirectory,
        '.optic',
        'api',
        'specification.json'
      ),
      contents: JSON.stringify(events),
    },
    {
      location: path.join(
        outputBaseDirectory,
        '.optic',
        'captures',
        captureId,
        'optic-capture-state.json'
      ),
      contents: JSON.stringify({
        captureId,
        status: 'completed',
        metadata: {
          startedAt: new Date().toISOString(),
          taskConfig: null,
          lastInteraction: null,
        },
      }),
    },
  ];

  await Promise.all(
    files.map(async (x) => {
      const { location, contents } = x;
      await fs.ensureDir(path.dirname(location));
      return fs.writeFile(location, contents);
    })
  );
}

const [
  ,
  ,
  inputFilePath,
  outputBaseDirectory,
  repeatSampleTimes,
  captureId,
] = process.argv;
main(inputFilePath, outputBaseDirectory, repeatSampleTimes, captureId);
