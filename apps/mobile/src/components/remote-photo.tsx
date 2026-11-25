import { useState } from "react";
import { Image, PixelRatio, type ImageErrorEvent, type ImageProps, type LayoutChangeEvent } from "react-native";
import { pictureForBox } from "@shared/charity/picture-sizes";

/**
 * A charity's picture from our public storage, at the right size for its box (25/11/2026, "Resize at upload"). The
 * website makes lighter copies of each picture when it is uploaded; once the box is measured, this loads the
 * narrowest copy that still gives the phone's own pixel density (three per point on an iPhone), or the original when
 * no copy is wide enough (a full-screen story card). A picture uploaded before copies were made has none, and is
 * loaded as it is stored, as before. If a copy can't load, the original is tried before giving up (`onError`).
 */
export function RemotePhoto({ uri, onError, ...rest }: Omit<ImageProps, "source" | "onLayout"> & { uri: string }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const chosen = box ? pictureForBox(uri, box.width, box.height, PixelRatio.get()) : null;
  const shown = chosen !== null && chosen === failed ? uri : chosen;
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.width === width && b.height === height ? b : { width, height }));
  };
  const broke = (e: ImageErrorEvent) => {
    if (shown && shown !== uri) setFailed(shown);
    else onError?.(e);
  };
  // Nothing is fetched until the box is measured (one frame), so the full-size file is never loaded by the way.
  return <Image {...rest} source={shown ? { uri: shown } : undefined} onLayout={measure} onError={broke} />;
}
