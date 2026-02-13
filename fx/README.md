# fx

A collection of utility functions to streamline asynchronous workflows.

---

These functions were originally part of the
[starfx](https://github.com/neurosnap/starfx) project and have been adapted for
use with the Effection framework.

## Migration Note

If you are looking for an Effection-native HTTP client with streaming response
support, use [`@effectionx/fetch`](../fetch/README.md).

`@effectionx/fx` keeps `request()` and `json()` unchanged for simple use cases.
