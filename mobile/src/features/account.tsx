import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Field, Notice, useCopy } from "../ui/components";
import { type } from "../ui/theme";
import { supabase } from "../lib/supabase";
import { store, useStore } from "../state/store";

export function Account() {
  const { t } = useCopy();
  const state = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  useEffect(() => {
    if (supabase && state.preferences.owner)
      void supabase.auth
        .getUser()
        .then(({ data }) => setAccountEmail(data.user?.email || ""));
  }, [state.preferences.owner]);
  async function auth(signup: boolean) {
    if (!supabase) return;
    setError("");
    setMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError(t("emailInvalid"));
    setBusy(true);
    try {
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error) throw result.error;
      if (signup && !result.data.session) setMessage(t("checkEmail"));
      if (result.data.session) {
        await store.account(result.data.session.user.id);
        await store.synchronize();
      }
      setPassword("");
    } catch {
      setError(t("authError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={type.heading}>{t("account")}</Text>
      {!supabase ? (
        <Notice>{t("backupUnavailable")}</Notice>
      ) : state.preferences.owner ? (
        <>
          <Text style={type.body}>{accountEmail}</Text>
          <Notice>{t(state.sync)}</Notice>
          <Button
            title={t("backup")}
            busy={state.sync === "syncing"}
            onPress={() => {
              void store.synchronize();
            }}
          />
          <Button
            title={t("signOut")}
            variant="outline"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const { error } = await supabase!.auth.signOut({
                  scope: "local",
                });
                if (error) throw error;
                await store.account(null);
              } catch {
                setError(t("networkError"));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : (
        <>
          <Notice>{t("localOnly")}</Notice>
          <Field
            label={t("email")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label={t("password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          <View style={{ gap: 8 }}>
            <Button
              title={t("signIn")}
              busy={busy}
              onPress={() => auth(false)}
            />
            <Button
              title={t("signUp")}
              variant="outline"
              disabled={busy}
              onPress={() => auth(true)}
            />
          </View>
        </>
      )}
      {!!error && <Notice warning>{error}</Notice>}
      {!!message && <Notice>{message}</Notice>}
    </Card>
  );
}
