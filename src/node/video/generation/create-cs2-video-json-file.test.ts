import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { TeamNumber } from 'csdm/common/types/counter-strike';
import { EncoderSoftware } from 'csdm/common/types/encoder-software';
import { RecordingOutput } from 'csdm/common/types/recording-output';
import { RecordingSystem } from 'csdm/common/types/recording-system';
import { VideoContainer } from 'csdm/common/types/video-container';
import { createCs2VideoJsonFile } from './create-cs2-video-json-file';

describe('create CS2 video JSON file', () => {
  it('focuses the initial player camera before recording starts when tickrate is unavailable', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csdm-cs2-video-'));
    const demoPath = path.join(tmpDir, 'demo.dem');
    const startTick = 1000;

    try {
      await createCs2VideoJsonFile({
        type: 'record',
        recordingSystem: RecordingSystem.HLAE,
        recordingOutput: RecordingOutput.Video,
        encoderSoftware: EncoderSoftware.FFmpeg,
        outputFolderPath: tmpDir,
        framerate: 60,
        demoPath,
        sequences: [
          {
            number: 1,
            startTick,
            endTick: 1200,
            showXRay: false,
            showAssists: true,
            showOnlyDeathNotices: true,
            playersOptions: [],
            playerCameras: [
              {
                tick: startTick,
                playerSteamId: 'targetSteamId',
                playerName: 'Target',
              },
              {
                tick: 1100,
                playerSteamId: 'otherSteamId',
                playerName: 'Other',
              },
            ],
            cameras: [],
            playerVoicesEnabled: true,
            recordAudio: false,
            deathNoticesDuration: 5,
          },
        ],
        closeGameAfterRecording: true,
        trueView: true,
        tickrate: 0,
        players: [
          {
            steamId: 'targetSteamId',
            slot: 8,
            userId: 7,
            side: TeamNumber.CT,
          },
          {
            steamId: 'otherSteamId',
            slot: 4,
            userId: 3,
            side: TeamNumber.T,
          },
        ],
        cameras: [],
        ffmpegSettings: {
          constantRateFactor: 23,
          videoContainer: VideoContainer.MP4,
          videoCodec: 'h264',
          outputParameters: '',
        },
      });

      const content = await fs.readFile(`${demoPath}.json`, 'utf8');
      const [sequence] = JSON.parse(content) as [{ actions: Array<{ cmd: string; tick: number }> }];
      const targetSpecMode = sequence.actions.find((action) => action.cmd === 'spec_mode 1');
      const targetFocus = sequence.actions.find((action) => action.cmd === 'spec_player 8');
      const laterFocus = sequence.actions.find((action) => action.cmd === 'spec_player 4');
      const recordStart = sequence.actions.find((action) => action.cmd === 'mirv_streams record start');

      expect(targetSpecMode?.tick).toBe(startTick - 64);
      expect(targetFocus?.tick).toBe(startTick - 60);
      expect(laterFocus?.tick).toBe(1100);
      expect(recordStart?.tick).toBe(startTick);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
