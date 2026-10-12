{
  description = "RESM development environment (NixOS and macOS)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          # NixOS needs patched Playwright browsers. On macOS, install the
          # browser binaries normally with `pnpm exec playwright install`.
          nixPlaywright = system == "x86_64-linux";
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_24
              pnpm
              git
            ] ++ pkgs.lib.optionals nixPlaywright [
              pkgs.playwright-driver.browsers
            ];

            shellHook = pkgs.lib.optionalString nixPlaywright ''
              # Keep @playwright/test aligned with the nixpkgs Playwright
              # browser version to avoid browser revision mismatches.
              export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
            '';
          };
        });
    };
}
