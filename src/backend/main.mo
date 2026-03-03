import Map "mo:core/Map";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Int "mo:core/Int";
import Order "mo:core/Order";

actor {
  // Types
  type Snapshot = {
    id : Nat;
    name : Text;
    engineStateJson : Text;
    timestamp : Int;
  };

  type Preset = {
    name : Text;
    mode : Text;
    paramsJson : Text;
  };

  type Pattern = {
    name : Text;
    stepDataJson : Text;
    bpm : Float;
    swing : Float;
  };

  // Modules
  module Snapshot {
    public func compare(a : Snapshot, b : Snapshot) : Order.Order {
      Nat.compare(a.id, b.id);
    };
  };

  module Preset {
    public func compare(a : Preset, b : Preset) : Order.Order {
      Text.compare(a.name, b.name);
    };
  };

  module Pattern {
    public func compare(a : Pattern, b : Pattern) : Order.Order {
      Text.compare(a.name, b.name);
    };
  };

  // Storage
  let snapshotStorage = Map.empty<Nat, Snapshot>();
  let presetStorage = Map.empty<Text, Preset>();
  let patternStorage = Map.empty<Text, Pattern>();
  var nextSnapshotId = 1;

  // Snapshot Functions
  public shared ({ caller }) func saveSnapshot(name : Text, stateJson : Text, timestamp : Int) : async Nat {
    let id = nextSnapshotId;
    let snapshot : Snapshot = {
      id;
      name;
      engineStateJson = stateJson;
      timestamp;
    };
    snapshotStorage.add(id, snapshot);
    nextSnapshotId += 1;
    id;
  };

  public query ({ caller }) func getSnapshot(id : Nat) : async Snapshot {
    switch (snapshotStorage.get(id)) {
      case (null) { Runtime.trap("Snapshot not found") };
      case (?snapshot) { snapshot };
    };
  };

  public query ({ caller }) func getAllSnapshots() : async [Snapshot] {
    snapshotStorage.values().toArray().sort();
  };

  public shared ({ caller }) func updateSnapshot(id : Nat, newStateJson : Text, newTimestamp : Int) : async () {
    switch (snapshotStorage.get(id)) {
      case (null) { Runtime.trap("Snapshot not found!") };
      case (?snapshot) {
        let updated : Snapshot = {
          id = snapshot.id;
          name = snapshot.name;
          engineStateJson = newStateJson;
          timestamp = newTimestamp;
        };
        snapshotStorage.add(id, updated);
      };
    };
  };

  public shared ({ caller }) func deleteSnapshot(id : Nat) : async () {
    if (not snapshotStorage.containsKey(id)) {
      Runtime.trap("Snapshot not found!");
    };
    snapshotStorage.remove(id);
  };

  // Preset Functions
  public shared ({ caller }) func savePreset(name : Text, mode : Text, paramsJson : Text) : async () {
    let preset : Preset = { name; mode; paramsJson };
    presetStorage.add(name, preset);
  };

  public query ({ caller }) func getPreset(name : Text) : async Preset {
    switch (presetStorage.get(name)) {
      case (null) { Runtime.trap("Preset not found!") };
      case (?preset) { preset };
    };
  };

  public query ({ caller }) func getAllPresetsByMode(mode : Text) : async [Preset] {
    let allPresets = presetStorage.values().toArray();
    let filtered = allPresets.filter(
      func(p) { p.mode == mode }
    );
    filtered.sort();
  };

  public shared ({ caller }) func deletePreset(name : Text) : async () {
    if (not presetStorage.containsKey(name)) {
      Runtime.trap("Preset not found!");
    };
    presetStorage.remove(name);
  };

  // Pattern Functions
  public shared ({ caller }) func savePattern(name : Text, stepDataJson : Text, bpm : Float, swing : Float) : async () {
    let pattern : Pattern = {
      name;
      stepDataJson;
      bpm;
      swing;
    };
    patternStorage.add(name, pattern);
  };

  public query ({ caller }) func getPattern(name : Text) : async Pattern {
    switch (patternStorage.get(name)) {
      case (null) { Runtime.trap("Pattern not found!") };
      case (?pattern) { pattern };
    };
  };

  public shared ({ caller }) func deletePattern(name : Text) : async () {
    if (not patternStorage.containsKey(name)) {
      Runtime.trap("Pattern does not exist!");
    };
    patternStorage.remove(name);
  };

  public query ({ caller }) func getAllPatterns() : async [Pattern] {
    patternStorage.values().toArray().sort();
  };
};
