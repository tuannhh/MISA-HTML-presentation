// Dựng repository + service từ cấu hình (dùng chung cho server, script quản trị và test tích hợp).
import { createUserRepository } from './repositories/userRepository.js';
import { createPresentationRepository } from './repositories/presentationRepository.js';
import { createAssetRepository } from './repositories/assetRepository.js';
import { createTemplateRepository } from './repositories/templateRepository.js';
import { createAuditRepository } from './repositories/auditRepository.js';
import { createShareRepository } from './repositories/shareRepository.js';
import { createVersionRepository } from './repositories/versionRepository.js';
import { MySqlSessionStore } from './repositories/sessionStore.js';
import { createLocalStorage } from './services/storageService.js';
import { createGeminiService } from './services/geminiService.js';
import { createBrowserService } from './services/browserService.js';
import { createAuthService } from './services/authService.js';
import { createPresentationService } from './services/presentationService.js';
import { createTemplateService } from './services/templateService.js';
import { createSharingService } from './services/sharingService.js';
import { createStockImageService } from './services/stockImageService.js';
import { createUrlSigner } from './lib/signedUrl.js';

export async function createContainer(config, pool, overrides = {}) {
  const repos = {
    users: createUserRepository(pool),
    presentations: createPresentationRepository(pool),
    assets: createAssetRepository(pool),
    templates: createTemplateRepository(pool),
    audit: createAuditRepository(pool),
    shares: createShareRepository(pool),
    versions: createVersionRepository(pool),
  };
  const storage = overrides.storage || createLocalStorage(config.storage);
  await storage.init();
  const gemini = overrides.gemini || createGeminiService(config.gemini);
  const browser = overrides.browser || createBrowserService({ chromePath: config.chromePath, concurrency: config.limits.renderConcurrency, noSandbox: config.chromeNoSandbox });
  const signer = createUrlSigner(config.session.secret);
  const stock = overrides.stock || createStockImageService(config.pixabay);
  const sessionStore = new MySqlSessionStore(pool);
  const presentations = createPresentationService({ config, repos, storage, gemini, browser, signer, audit: repos.audit, stock });
  const services = {
    sessionStore,
    auth: createAuthService({ config, repos, audit: repos.audit }),
    presentations,
    templates: createTemplateService({ repos, storage, signer, audit: repos.audit }),
    sharing: createSharingService({ repos, decks: presentations, audit: repos.audit }),
  };
  return { repos, services, storage, browser, sessionStore };
}
