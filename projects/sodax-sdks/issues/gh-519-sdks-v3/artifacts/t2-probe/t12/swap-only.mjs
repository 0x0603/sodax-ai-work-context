import { sodaxConfig } from '@sodax/types';
import { BackendApiService } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/backendApi/BackendApiService.js';
import { ConfigService } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/shared/config/index.js';
import { EvmHubProvider } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/shared/entities/EvmHubProvider.js';
import { SpokeService } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/shared/services/spoke/SpokeService.js';
import { resolveLogger } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/shared/logger.js';
import { resolveAnalytics } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/shared/analytics.js';
import { SwapService } from '/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/packages/sdk/dist/esm/swap/SwapService.js';

const logger = resolveLogger(undefined);
const backendApi = new BackendApiService(sodaxConfig.api, logger, {});
const config = new ConfigService({ api: backendApi, config: sodaxConfig, userConfig: undefined, logger, analytics: resolveAnalytics(undefined) });
const hubProvider = new EvmHubProvider({ config });
const spoke = new SpokeService({ config, hubProvider });
console.log(new SwapService({ config, hubProvider, spoke, backendApi }));
