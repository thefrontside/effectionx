import { style } from "@react-spectrum/s2/style" with { type: "macro" };

export const childRowStyle = style({
  default: {
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 8,
    borderBottom: "1px solid var(--spectrum-global-color-gray-100)",
    selectors: {
      "&:focus, &:hover": {
        background: "rgba(0, 0, 0, 0.03)",
        outline: "none",
      },
    },
  },
  cursor: {
    variant: {
      clickable: "pointer",
    },
  },
  runtime: true,
} as const);

export const childTypeStyle = style({
  color: "var(--spectrum-global-color-gray-600)",
});
