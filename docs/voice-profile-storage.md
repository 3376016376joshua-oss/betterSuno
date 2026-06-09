# Voice Profile Storage

V1 vocal remix jobs can resolve voice model artifacts from a fixed backend location instead of requiring the frontend to pass raw file paths.

## Local layout

Default root:

```text
storage/voice-profiles/
```

Profile layout:

```text
storage/voice-profiles/<profile-id>/
  profile.json
  model.pth
  index.faiss
```

SVC profiles can use `adapter.safetensors`, `model.safetensors`, `model.pth`, or a manifest-defined `modelPath`.

RVC profiles can use `model.pth` plus `index.faiss` or a manifest-defined `indexPath`.

## Manifest

```json
{
  "id": "demo-rvc",
  "displayName": "Demo RVC",
  "converterMode": "rvc",
  "modelPath": "model.pth",
  "indexPath": "index.faiss"
}
```

`converterCommandJson` and `converterCwd` can also live in the manifest when a profile needs a dedicated converter command.

```json
{
  "id": "demo-svc",
  "converterMode": "svc",
  "modelPath": "adapter.safetensors",
  "converterCwd": "/opt/svc",
  "converterCommandJson": "[\"python\",\"/opt/svc/infer.py\",\"--input\",\"{input}\",\"--output\",\"{output}\",\"--model\",\"{voiceModel}\"]"
}
```

## Environment presets

When the API request passes `converterMode: "svc"` or `converterMode: "rvc"`, the backend can use global presets:

```text
VOICE_PROFILES_DIR=storage/voice-profiles
SVC_CONVERTER_COMMAND_JSON=
SVC_CONVERTER_CWD=
RVC_CONVERTER_COMMAND_JSON=
RVC_CONVERTER_CWD=
```

The frontend can then submit only `voiceProfileId` and `converterMode`; the backend resolves model/index paths and converter settings.

## Future OSS support

The manifest supports remote artifact fields:

```json
{
  "id": "prod-rvc-001",
  "converterMode": "rvc",
  "modelUri": "oss://bucket/voice-profiles/prod-rvc-001/model.pth",
  "indexUri": "oss://bucket/voice-profiles/prod-rvc-001/index.faiss"
}
```

Remote URIs currently fail fast with a clear configuration error. The intended next step is to add a downloader/cache layer inside the voice profile resolver, so API and frontend contracts do not change when local files move to OSS.
