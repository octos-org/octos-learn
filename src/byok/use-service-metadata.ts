import { ApiError } from "@/api/client";
import { useEffect, useState } from "react";
import { listClientServices, type Capability, type ServiceMetadata } from "./services";

export type ServiceMetadataMap = Partial<Record<Capability, ServiceMetadata>>;
export function useServiceMetadata() {
  const [metadata, setMetadata] = useState<ServiceMetadataMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    listClientServices().then(result => {
      if (active) { setMetadata(result.services); setError(""); }
    }).catch(error => { if (active) setError(error instanceof ApiError ? `Could not load service configuration (${error.status}). ${error.message}` : "Could not load service configuration. Reload to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  const reload = () => { setLoading(true); setError(""); setVersion(value => value + 1); };
  return { metadata, setMetadata, loading, error, reload };
}
