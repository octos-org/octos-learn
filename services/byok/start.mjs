import { createProductServer } from "../product-server.mjs";

const server = createProductServer({ octosBaseUrl: process.env.OCTOS_BASE_URL || "http://127.0.0.1:50080", registryRoot: process.env.OCTOS_REGISTRY_ROOT, historyDatabasePath: process.env.OCTOS_LEARN_HISTORY_DB });
server.listen(Number(process.env.PORT || 50081), process.env.HOST || "127.0.0.1", () => {
  console.log("Octos Learn product service ready.");
});
