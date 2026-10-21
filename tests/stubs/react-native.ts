/** Stand-in for react-native in unit tests (the real package can't load outside the app). */
export const Platform = { OS: "ios" as string };
/** Only the shape the app's supabase client uses, so the website's type check can read it without the phone app's packages. */
export const AppState = {
  addEventListener(_type: "change", _listener: (state: string) => void) {
    return { remove() {} };
  },
};
