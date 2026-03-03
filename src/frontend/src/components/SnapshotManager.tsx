import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import audioEngine from "../audio/AudioEngine";
import type { SynthPreset } from "../audio/presets";
import { useActor } from "../hooks/useActor";
import { useSynth } from "../store/synthStore";

export function SnapshotManager() {
  const { actor, isFetching } = useActor();
  const { state, dispatch } = useSynth();
  const qc = useQueryClient();
  const [saveName, setSaveName] = useState("");
  const [open, setOpen] = useState(false);

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllSnapshots();
    },
    enabled: !!actor && !isFetching,
  });

  const saveMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Not connected");
      const stateJson = JSON.stringify({
        mode: state.mode,
        params: state.params,
        modMatrix: state.modMatrix,
        activePreset: state.activePreset?.name,
      });
      const timestamp = BigInt(Date.now());
      await actor.saveSnapshot(name, stateJson, timestamp);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      setSaveName("");
      toast.success("Snapshot saved");
    },
    onError: () => toast.error("Failed to save snapshot"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Not connected");
      await actor.deleteSnapshot(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      toast.success("Snapshot deleted");
    },
  });

  const recallSnapshot = async (id: bigint) => {
    if (!actor) return;
    try {
      const snapshot = await actor.getSnapshot(id);
      const parsed = JSON.parse(snapshot.engineStateJson);
      if (parsed.params)
        dispatch({ type: "SET_PARAMS", params: parsed.params });
      if (parsed.mode) dispatch({ type: "SET_MODE", mode: parsed.mode });
      if (parsed.params) {
        audioEngine.setParams(parsed.params);
      }
      toast.success(`Recalled: ${snapshot.name}`);
      setOpen(false);
    } catch {
      toast.error("Failed to recall snapshot");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="synth-btn">
          Snapshots
        </button>
      </PopoverTrigger>
      <PopoverContent className="modal-glass w-72 p-3" align="end">
        <div className="section-label mb-2">Snapshots</div>

        {/* Save form */}
        <div className="flex gap-1 mb-3">
          <input
            type="text"
            placeholder="Snapshot name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="flex-1 text-xs font-mono rounded px-2 py-1"
            style={{
              background: "oklch(0.07 0.005 255)",
              border: "1px solid oklch(0.22 0.012 240)",
              color: "oklch(0.88 0.01 200)",
              fontSize: "0.7rem",
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && saveName && saveMutation.mutate(saveName)
            }
          />
          <button
            type="button"
            className="synth-btn active"
            onClick={() => saveName && saveMutation.mutate(saveName)}
            disabled={saveMutation.isPending || !saveName}
          >
            Save
          </button>
        </div>

        {/* Snapshot list */}
        <div
          className="flex flex-col gap-1 overflow-y-auto"
          style={{ maxHeight: 240 }}
        >
          {snapshots.length === 0 && (
            <div className="section-label text-center py-3">
              No snapshots saved
            </div>
          )}
          {snapshots.map((snap) => (
            <div
              key={String(snap.id)}
              className="flex items-center gap-2 synth-panel-raised rounded px-2 py-1"
            >
              <button
                type="button"
                className="flex-1 text-left text-xs font-mono hover:text-primary transition-colors truncate"
                style={{ color: "oklch(0.78 0.18 195)", fontSize: "0.65rem" }}
                onClick={() => recallSnapshot(snap.id)}
              >
                {snap.name}
              </button>
              <button
                type="button"
                className="synth-btn py-0"
                style={{
                  color: "oklch(0.65 0.22 25)",
                  fontSize: "0.55rem",
                  padding: "1px 4px",
                }}
                onClick={() => deleteMutation.mutate(snap.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SnapshotManager;
