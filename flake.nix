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

              # WebKit needs EGL even when it runs headless. On NixOS it finds
              # the system's graphics drivers under /run/opengl-driver. On any
              # other Linux, such as the machines of GitHub Actions, libraries
              # from Nix find no driver at all, and WebKit aborts as soon as a
              # page is opened. Point it to Mesa's software renderer there.
              if [ ! -e /run/opengl-driver ]; then
                export __EGL_VENDOR_LIBRARY_DIRS="${pkgs.mesa}/share/glvnd/egl_vendor.d"
                export LIBGL_DRIVERS_PATH="${pkgs.mesa}/lib/dri"
                export GBM_BACKENDS_PATH="${pkgs.mesa}/lib/gbm"
                export LIBGL_ALWAYS_SOFTWARE=1
              fi
            '';
          };
        });
    };
}
