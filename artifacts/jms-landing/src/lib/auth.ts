const NAME_KEY = "jobflow_name";
const EMAIL_KEY = "jobflow_email";

export function setSession(email: string, name = "Alex Morgan") {
  sessionStorage.setItem(EMAIL_KEY, email);
  sessionStorage.setItem(NAME_KEY, name);
}

export function getName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? "Alex Morgan";
}

export function getEmail(): string {
  return sessionStorage.getItem(EMAIL_KEY) ?? "admin@jobflow.io";
}

export function clearSession() {
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(NAME_KEY);
}
