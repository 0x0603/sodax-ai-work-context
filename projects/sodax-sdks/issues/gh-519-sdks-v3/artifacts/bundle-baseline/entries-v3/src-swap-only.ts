// What a client-first "swap" action needs: hub client + spokes + backend API + SwapService. No MM, DEX,
// staking, migration, bridge, leverage, partner, recovery, sponsoring services.
import { sodaxConfig } from '@sodax/types';
import { BackendApiService } from 'sdk-src/backendApi/BackendApiService.js';
import { ConfigService } from 'sdk-src/shared/config/index.js';
import { EvmHubProvider } from 'sdk-src/shared/entities/EvmHubProvider.js';
import { SpokeService } from 'sdk-src/shared/services/spoke/SpokeService.js';
import { SwapService } from 'sdk-src/swap/SwapService.js';
import { resolveLogger } from 'sdk-src/shared/logger.js';
import { resolveAnalytics } from 'sdk-src/shared/analytics.js';
const logger = resolveLogger(undefined);
const analytics = resolveAnalytics(undefined);
const backendApi = new BackendApiService(sodaxConfig.api, logger, {});
const config = new ConfigService({ api: backendApi, config: sodaxConfig, logger, analytics });
const hubProvider = new EvmHubProvider({ config });
const spoke = new SpokeService({ config, hubProvider });
export const swaps = new SwapService({ config, hubProvider, spoke, backendApi });
