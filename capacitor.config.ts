import type { CapacitorConfig } from '@capacitor/cli';
import profileConfig from './config/capacitor-profiles.json';

type CapacitorProfile = keyof typeof profileConfig;

const requestedProfile = process.env.CAPACITOR_PROFILE?.trim();

if (!requestedProfile || !Object.prototype.hasOwnProperty.call(profileConfig, requestedProfile)) {
  throw new Error(
    'CAPACITOR_PROFILE must be one of: remote-dev, local-spike, staging, production.'
  );
}

const profile = requestedProfile as CapacitorProfile;
const selectedProfile = profileConfig[profile];

const config: CapacitorConfig = {
  appName: 'Native Minutes',
  ...selectedProfile
};

export default config;
