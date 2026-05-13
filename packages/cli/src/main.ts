#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(contractCommand);
program.addCommand(keysCommand);
program.addCommand(lineageCommand);
program.addCommand(fleetCommand);

program.parse(process.argv);
