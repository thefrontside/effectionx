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
import { dag, Container, Directory, File, object, func, argument } from "@dagger.io/dagger"

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
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "software-properties-common"])
      .withExec(["add-apt-repository", "-y", "ppa:colin-king/stress-ng"])
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "curl", "unzip", "nodejs", "stress-ng"])
      .withExec(["sh", "-c", "curl -fsSL https://deno.land/install.sh | sh"])
      .withMountedDirectory("/effectionx", this.source)
      .withEnvVariable("PATH", "$PATH:/root/.deno/bin", { expand: true })
      .withWorkdir("/effectionx")
      .withExec(["deno", "install", "--allow-scripts"])
      .withExec(["deno", "task", "generate-importmap"])
  }

  @func()
  async testV3Stress(
    @argument({ defaultValue: 100 })
    rounds: number
  ): Promise<File> {
    const container = this.ubuntu()
      .withExec(["bash", "run-test-v3-stress.sh", rounds.toString()])

    // Get the filename
    const filename = await container
      .withExec(["sh", "-c", "ls /effectionx/test-summary-v3_*.log"])
      .stdout()

    return container.file(filename.trim())
  }

  @func()
  async testV4Stress(
    @argument({ defaultValue: 100 })
    rounds: number
  ): Promise<File> {
    const container = this.ubuntu()
      .withExec(["bash", "run-test-v4-stress.sh", rounds.toString()])

    // Get the filename
    const filename = await container
      .withExec(["sh", "-c", "ls /effectionx/test-summary-v4_*.log"])
      .stdout()

    return container.file(filename.trim())
  }
}
