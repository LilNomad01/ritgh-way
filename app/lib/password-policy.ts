export function passwordPolicyError(password: string) {
  return password.length < 10 ? "Use pelo menos 10 caracteres." : null;
}
