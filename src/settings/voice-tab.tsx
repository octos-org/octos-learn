import type { Profile } from "./settings-api";
import { ServiceSettings } from "@/byok/service-settings";
export function VoiceTab(props: { profile: Profile; onProfileUpdated: (profile: Profile) => void }) {
  return <ServiceSettings key={props.profile.id} />;
}
