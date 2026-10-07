import { createApp } from './app';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';

const config = loadConfig();
const app = createApp({ config, logger });

app.listen(config.port, () => {
  logger.info('api_started', {
    authMode: config.authMode,
    port: config.port,
    url: `http://localhost:${config.port}`,
  });
});
