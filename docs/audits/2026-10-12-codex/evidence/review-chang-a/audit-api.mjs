export * from '../../../../../test/helpers/fake-api.mjs';
export const put = (path, body) => globalThis.__fakeApi('PUT', path, body);
