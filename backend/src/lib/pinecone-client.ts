import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config(); // Ensure environment variables are loaded

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT_HOST_URL = process.env.PINECONE_ENVIRONMENT; // This should be the full host URL like https://index_name-project_id.svc.environment.pinecone.io
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;

if (!PINECONE_API_KEY) {
  throw new Error(
    "Pinecone API key is not defined. Please set PINECONE_API_KEY in your .env file."
  );
}

if (!PINECONE_ENVIRONMENT_HOST_URL) {
  throw new Error(
    "Pinecone environment/host URL is not defined. Please set PINECONE_ENVIRONMENT in your .env file."
  );
}

if (!PINECONE_INDEX_NAME) {
  throw new Error(
    "Pinecone index name is not defined. Please set PINECONE_INDEX_NAME in your .env file."
  );
}

let pinecone: Pinecone | null = null;

async function initializePineconeClient() {
  if (!pinecone) {
    pinecone = new Pinecone({
      apiKey: PINECONE_API_KEY || "",
      // The environment in the new Pinecone client is often the controller host,
      // but for serverless indexes, the full index host URL is used more directly.
      // The JS client might infer controller from the index host if it's a full URL.
      // For serverless, it's often just the API key for initialization, then you target the index host.
      // However, the new client structure prefers just apiKey at the top level initialization.
    });
  }
  return pinecone;
}

// Initialize and export the specific index
// Note: Direct access to the index host URL is typically how serverless indexes are targeted.
// The new client syntax `pinecone.Index(PINECONE_INDEX_NAME)` might need the controller host in `new Pinecone()`
// or it might resolve correctly if `PINECONE_ENVIRONMENT` is the controller host.
// For serverless, the index host is primary.

// The Pinecone client is evolving. The following approach is more robust for serverless:
// Use the Pinecone instance to get a reference to your index, specifying the host.

// We will initialize the client first, then get the index.
// It's better to export a function that returns the index to ensure client is initialized.

let pineconeIndex: any; // Using any for now as Index<T> type can be complex with metadata

export async function getPineconeIndex() {
  if (pineconeIndex) {
    return pineconeIndex;
  }

  const client = await initializePineconeClient();
  if (!client) {
    throw new Error("Pinecone client could not be initialized.");
  }

  // For serverless indexes, you often target the index directly using its host.
  // The Pinecone client's `index()` method can take the full host.
  // Let's assume PINECONE_INDEX_NAME is just the name, and PINECONE_ENVIRONMENT_HOST_URL is the full URL to the index endpoint.

  pineconeIndex = client.Index(PINECONE_INDEX_NAME || "");
  // If your PINECONE_ENVIRONMENT_HOST_URL is the controller host (e.g. "aped-4627-b74a.pinecone.io")
  // and PINECONE_INDEX_NAME is "twinmind", then `client.Index(PINECONE_INDEX_NAME)` should work after initializing `new Pinecone({ apiKey, environment: "controller-host"})`
  // If PINECONE_ENVIRONMENT_HOST_URL is the full index URL (e.g. "https://twinmind-....pinecone.io")
  // The V3 client handles this by simply `new Pinecone({ apiKey })` and then `pinecone.index(PINECONE_INDEX_NAME).namespace(YOUR_NAMESPACE_IF_ANY)`
  // The host is often derived by the client or not explicitly needed if index name is unique within project/env.

  // Given your setup, PINECONE_ENVIRONMENT is the full host of the index.
  // The latest Pinecone client @pinecone-database/pinecone v2.x.x and above
  // takes the full index host for the index method if it's a serverless index.
  // pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  // pineconeIndex = pinecone.index(PINECONE_INDEX_NAME, PINECONE_ENVIRONMENT_HOST_URL);
  // Let's stick to client.Index(name) as it's the more common pattern and the client should resolve it.

  // A quick test to ensure the index is accessible (optional, remove for production)
  try {
    await pineconeIndex.describeIndexStats();
    console.log(
      `Successfully connected to Pinecone index: ${PINECONE_INDEX_NAME}`
    );
  } catch (error) {
    console.error(
      `Error connecting to Pinecone index ${PINECONE_INDEX_NAME}:`,
      error
    );
    throw new Error(
      `Could not connect to or describe Pinecone index ${PINECONE_INDEX_NAME}. Check your host URL and API key.`
    );
  }

  return pineconeIndex;
}

// Also export the OpenAI embedding model name for consistency
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL_NAME || "text-embedding-3-small";

if (!process.env.OPENAI_EMBEDDING_MODEL_NAME) {
  console.warn(
    "OPENAI_EMBEDDING_MODEL_NAME not set in .env, defaulting to 'text-embedding-3-small'. It's recommended to set this explicitly."
  );
}
