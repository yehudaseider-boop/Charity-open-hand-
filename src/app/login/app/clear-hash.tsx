"use client";

import { useEffect } from "react";

/** The email link can carry sign-in details after the #. This page doesn't use them, so they leave the address bar and history. */
export function ClearSignInHash() {
  useEffect(() => {
    const { hash, search, pathname } = window.location;
    if (hash || search) window.history.replaceState(null, "", pathname);
  }, []);
  return null;
}
