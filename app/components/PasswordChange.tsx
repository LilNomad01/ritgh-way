"use client";

import { FormEvent, useState } from "react";

export function PasswordChange({ onClose, onChanged, required = false }: { onClose: () => void; onChanged: () => void; required?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError("A confirmação não corresponde à nova senha."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível alterar a senha.");
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="admin-editor-backdrop"><form className="admin-editor password-editor" onSubmit={submit}>
    <div className="editor-head"><div><span className="eyebrow">SEGURANÇA DA CONTA</span><h2>Crie sua senha definitiva</h2></div>{!required && <button type="button" onClick={onClose}>×</button>}</div>
    <p>A senha inicial foi criada apenas para o primeiro acesso. Troque-a agora para proteger sua conta.</p>
    <label>Senha atual<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
    <label>Nova senha<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
    <label>Confirme a nova senha<input required minLength={12} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
    <small>Use 12 ou mais caracteres, incluindo maiúscula, minúscula, número e símbolo.</small>
    {error && <div className="admin-alert">{error}</div>}
    <div className="editor-actions">{!required && <button type="button" onClick={onClose}>Agora não</button>}<button type="submit" disabled={saving}>{saving ? "Protegendo conta..." : "Salvar nova senha"}</button></div>
  </form></div>;
}
