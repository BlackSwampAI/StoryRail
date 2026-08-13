"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef, type Layout } from "react-resizable-panels";

import styles from "./newsroom-shell.module.css";

export const DESK_LAYOUT_STORAGE_KEY = "storyrail:newsroom-desk-layout:v1";

export function parseDeskLayout(value: string | null): Layout | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const desk = Reflect.get(parsed, "desk");
    const workspace = Reflect.get(parsed, "workspace");
    if (
      typeof desk !== "number" ||
      typeof workspace !== "number" ||
      !Number.isFinite(desk) ||
      !Number.isFinite(workspace) ||
      desk <= 0 ||
      workspace <= 0 ||
      Math.abs(desk + workspace - 100) > 0.5
    )
      return null;
    return { desk, workspace };
  } catch {
    return null;
  }
}

function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 52.001rem)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return desktop;
}

export function ResizableNewsroomLayout({
  desk,
  workspace,
}: Readonly<{ desk: ReactNode; workspace: ReactNode }>) {
  const desktop = useDesktopLayout();
  const groupRef = useGroupRef();
  const restored = useRef(false);

  useEffect(() => {
    if (!desktop) {
      restored.current = false;
      return;
    }
    if (restored.current) return;
    restored.current = true;
    let saved: Layout | null = null;
    try {
      saved = parseDeskLayout(window.localStorage.getItem(DESK_LAYOUT_STORAGE_KEY));
    } catch {
      // Browser storage can be unavailable even when the UI remains usable.
    }
    if (saved !== null) groupRef.current?.setLayout(saved);
  }, [desktop, groupRef]);

  if (!desktop)
    return (
      <div className={styles.shell} data-layout="stacked">
        {desk}
        {workspace}
      </div>
    );

  return (
    <Group
      className={`${styles.shell} ${styles.resizableShell}`}
      id="storyrail-newsroom-layout"
      groupRef={groupRef}
      style={{ height: "100vh" }}
      resizeTargetMinimumSize={{ coarse: 24, fine: 12 }}
      onLayoutChanged={(layout, metadata) => {
        if (!metadata.isUserInteraction) return;
        try {
          window.localStorage.setItem(DESK_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        } catch {
          // Presentation preferences must never interrupt editorial work.
        }
      }}
    >
      <Panel
        id="desk"
        defaultSize="24rem"
        minSize="18rem"
        maxSize="34rem"
        groupResizeBehavior="preserve-pixel-size"
        style={{ overflow: "hidden" }}
      >
        {desk}
      </Panel>
      <Separator
        id="desk-workspace-separator"
        className={styles.deskSeparator}
        aria-label="Resize the Desk"
      >
        <span aria-hidden="true" />
      </Separator>
      <Panel id="workspace" minSize="28rem">
        {workspace}
      </Panel>
    </Group>
  );
}
