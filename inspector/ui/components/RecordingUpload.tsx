import {
  DropZone,
  IllustratedMessage,
  Heading,
  Content,
  ButtonGroup,
  Button,
  FileTrigger,
} from "@react-spectrum/s2";
import React, { useState } from "react";
import CloudUpload from "@react-spectrum/s2/illustrations/gradient/generic1/CloudUpload";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };

const fileTypes = ["text/plain", "application/json"];

export function RecordingUpload(props: { setFile: (file: File) => void }) {
  //   const dispatch = useDispatch();
  let [content, setContent] = useState<React.ReactNode>(null);
  return (
    <DropZone
      {...props}
      styles={style({ width: 320, maxWidth: "90%" })}
      isFilled={!!content}
      // Determine whether dragged content should be accepted.
      getDropOperation={(types) =>
        fileTypes.some((t) => types.has(t)) ? "copy" : "cancel"
      }
      onDrop={async (event) => {
        // Find the first accepted item.
        let item = event.items.find(
          (item) =>
            (item.kind === "text" && item.types.has("text/plain")) ||
            (item.kind === "file" && item.type.startsWith("image/")),
        );

        if (item?.kind === "text") {
          let text = await item.getText("text/plain");
          setContent(text);
        } else if (item?.kind === "file") {
          console.error(item);
        }
      }}
    >
      {content || (
        <IllustratedMessage>
          <CloudUpload aria-hidden={false}/>
          <Heading>Drag and drop your file</Heading>
          <Content>Or, select a file from your computer</Content>
          <ButtonGroup>
            <FileTrigger
              acceptedFileTypes={fileTypes}
              onSelect={async (files) => {
                if (!files) return;
                const firstFile = files[0];
                props.setFile(firstFile);
              }}
            >
              <Button variant="accent">Browse files</Button>
            </FileTrigger>
          </ButtonGroup>
        </IllustratedMessage>
      )}
    </DropZone>
  );
}
