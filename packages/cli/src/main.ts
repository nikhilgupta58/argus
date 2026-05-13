#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { initCommand } from "./commands/init.js";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";
import { daemonCommand } from "./commands/daemon.js";
import { publisherCommand } from "./commands/publisher.js";
import { specialistPublishCommand } from "./commands/specialist-publish.js";
import { marketplaceCommand } from "./commands/marketplace.js";

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
