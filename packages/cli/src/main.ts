#!/usr/bin/env bun
import { ARGUS_VERSION } from "@argus/core";
import { Command } from "commander";
import { contractCommand } from "./commands/contract.js";
import { daemonCommand } from "./commands/daemon.js";
import { fleetCommand } from "./commands/fleet.js";
import { initCommand } from "./commands/init.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { marketplaceCommand } from "./commands/marketplace.js";
import { publisherCommand } from "./commands/publisher.js";
import { specialistPublishCommand } from "./commands/specialist-publish.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(initCommand);
program.addCommand(contractCommand);
program.addCommand(keysCommand);
program.addCommand(lineageCommand);
program.addCommand(fleetCommand);
program.addCommand(daemonCommand);
program.addCommand(publisherCommand);
program.addCommand(specialistPublishCommand);
program.addCommand(marketplaceCommand);

program.parse(process.argv);
