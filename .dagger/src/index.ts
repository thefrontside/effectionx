/**
 * A generated module for Effectionx functions
 *
 * This module has been generated via dagger init and serves as a reference to
 * basic module structure as you get started with Dagger.
 *
 * Two functions have been pre-created. You can modify, delete, or add to them,
 * as needed. They demonstrate usage of arguments and return types using simple
 * echo and grep commands. The functions can be called from the dagger CLI or
 * from one of the SDKs.
 *
 * The first line in this comment block is a short description line and the
 * rest is a long description with more detail on the module's purpose or usage,
 * if appropriate. All modules should have a short description.
 */
import { dag, Container, Directory, object, func, argument } from "@dagger.io/dagger"

@object()
export class Effectionx {
  source: Directory

  constructor(
    @argument({ defaultPath: ".", ignore: ["**/.dagger/**/*"] })
    source: Directory,
  ) {
    this.source = source
  }

  @func()
  ubuntu(): Container {
    return dag
      .container()
      .from("ubuntu:latest")
      .withExec(["apt", "update"])
      .withExec(["apt", "install", "-y", "curl", "unzip", "nodejs"])
      .withExec(["sh", "-c", "curl -fsSL https://deno.land/install.sh | sh"])
      .withMountedDirectory("/effectionx", this.source)
      .withEnvVariable("PATH", "$PATH:/root/.deno/bin", { expand: true })
      .withWorkdir("/effectionx")
      .withExec(["deno", "task", "generate-importmap"])
  }

  @func()
  windows(): Container {
    return dag
      .container()
      .from("dockurr/windows")
  }
}
