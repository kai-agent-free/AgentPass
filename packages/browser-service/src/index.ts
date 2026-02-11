export {
  BrowserManager,
  type BrowserLaunchOptions,
  navigate,
  fillForm,
  clickButton,
  screenshot,
  waitForElement,
  getPageContent,
  detectCaptcha,
  type FormField,
  type CaptchaDetectionResult,
} from './automation/index.js';

export {
  registerOnService,
  type RegistrationOptions,
  type RegistrationResult,
  loginToService,
  type LoginOptions,
  type LoginResult,
} from './strategies/index.js';
