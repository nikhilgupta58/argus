import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Argus",
      description: "Outcome-owning agents with signed lineage",
      social: {
        github: "https://github.com/nikhilgupta58/argus",
      },
      sidebar: [
        {
          label: "Get Started",
          items: [
            { label: "Quickstart", slug: "" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Contract DSL", slug: "contract-spec" },
            { label: "Lineage Format", slug: "lineage-spec" },
            { label: "Specialist SDK", slug: "specialist-sdk" },
            { label: "Architecture", slug: "architecture" },
          ],
        },
      ],
    }),
  ],
  output: "static",
  site: "https://docs.argus.dev",
});
