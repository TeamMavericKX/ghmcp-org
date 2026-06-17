// Public surface of the tenant module.

export {
  TenantRegistry,
  type TenantConfig,
  type TenantRegistryOptions,
} from './registry.js';

export {
  loadTenantRegistryFromDocument,
  loadTenantRegistryFromFile,
  type TenantConfigDocument,
  type TenantConfigDocumentTenant,
  type TenantConfigFileSource,
  type LoadTenantConfigOptions,
} from './config.js';
