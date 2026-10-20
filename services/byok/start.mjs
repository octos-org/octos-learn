import { createByokServer } from "./server.mjs";

const server = createByokServer({ octosBaseUrl: process.env.OCTOS_BASE_URL || "http://127.0.0.1:50080", registryRoot: process.env.OCTOS_REGISTRY_ROOT });
server.listen(Number(process.env.PORT || 50081), process.env.HOST || "127.0.0.1", () => {
  console.log("Octos Learn BYOK service ready.");
});
