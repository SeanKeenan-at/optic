import { test, expect, describe, beforeEach, jest } from '@jest/globals';
import { UserError } from '@useoptic/openapi-utilities';
import { createOpticClient } from '../client';
import {
  detectCliConfig,
  initializeRules,
  validateConfig,
  RawYmlConfig,
} from '../config';

jest.mock('../client');

describe('detectConfig', () => {
  beforeEach(() => {
    console.warn = jest.fn();
  });

  test('finds config', async () => {
    const path = await detectCliConfig('src/__tests__/');
    expect(path).toBe('src/__tests__/optic.yml');

    // Expecting deprecation warning
    expect(console.warn).toHaveBeenCalled();
  });

  test("doesn't find config", async () => {
    const path = await detectCliConfig('src');
    expect(path).toBeUndefined();
  });
});

describe('validateConfig', () => {
  test('success', () => {
    const config = {};
    expect(() => validateConfig(config, 'somePath')).not.toThrow();
  });

  describe('rulesets', () => {
    test('not array is invalid', () => {
      const config = { ruleset: { foo: 'bar' } };
      expect(() => validateConfig(config, 'somePath')).toThrow(UserError);
    });

    test('string is valid', () => {
      const config = { ruleset: ['foo'] };
      expect(() => validateConfig(config, 'somePath')).not.toThrow();
    });

    test('object is valid', () => {
      const config = {
        ruleset: [{ foo: { someOption: true } }],
      };
      expect(() => validateConfig(config, 'somePath')).not.toThrow();
    });

    test('object with invalid config', () => {
      const config = {
        ruleset: [{ foo: 'foo', options: 'yeah' }],
      };
      expect(() => validateConfig(config, 'somePath')).toThrow(UserError);
    });
  });
});

describe('initializeRules', () => {
  test('empty ruleset', async () => {
    const config: RawYmlConfig = {};
    await initializeRules(config, createOpticClient(''));

    expect(config.ruleset).toEqual([]);
  });

  test('valid rules', async () => {
    const config: RawYmlConfig = {
      ruleset: ['some-rule', { 'complex-rule': { withConfig: true } }],
    };

    await initializeRules(config, createOpticClient(''));
    expect(config.ruleset?.length).toBe(2);
    expect(config.ruleset?.[0]).toEqual({ name: 'some-rule', config: {} });
    expect(config.ruleset?.[1]).toEqual({
      name: 'complex-rule',
      config: { withConfig: true },
    });
  });

  test('empty rule', async () => {
    const config: RawYmlConfig = {
      ruleset: [{}],
    };

    await expect(() =>
      initializeRules(config, createOpticClient(''))
    ).rejects.toThrow(UserError);
  });

  test('extends ruleset from cloud', async () => {
    const mockClient = {
      getStandard: jest.fn<any>(),
    };
    mockClient.getStandard.mockResolvedValue({
      config: {
        ruleset: [
          { name: 'from-cloud-ruleset', config: {} },
          { name: 'should-be-overwritten', config: { hello: true } },
        ],
      },
    });
    (createOpticClient as jest.MockedFunction<any>).mockImplementation(
      () => mockClient
    );

    const config: RawYmlConfig = {
      ruleset: [{ 'should-be-overwritten': { goodbye: false } }],
      extends: '@orgslug/rulesetconfigid',
    };
    await initializeRules(config, createOpticClient(''));
    expect(config.ruleset).toEqual([
      { name: 'from-cloud-ruleset', config: {} },
      { name: 'should-be-overwritten', config: { goodbye: false } },
    ]);
  });
});
