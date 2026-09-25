# IIIF Presentation API 4.0: An Optional 3D Plugin

> **Recommendation (2026-09-18): use Three.js for a deliberately small,
> experimental Scene viewer.** Start with the published simplest-3D Cookbook
> recipe: one static GLB at the Scene origin, client-supplied lighting and camera,
> accessible orbit/zoom/reset controls, and reliable teardown. Describe this as
> support for a documented draft subset, not Presentation 4 conformance.

Research date: 2026-09-18. This report covers external specifications, libraries,
implementations, and the existing viewer integration contracts. The local context is
[presentation-api-4-support.md](presentation-api-4-support.md), particularly its
measured behaviour and Cookbook-based scope. The earlier decision to leave 3D
unsupported is the premise being reconsidered. Section 7 records source inspection
of core and the AV plugin; recommendations are not implementation decisions.

## Accepted direction and intended destination

The project owner accepted Three.js and the recommendations in this report.
The intended final result is full IIIF 3D Scene support, including composition
with image-bearing Canvases, audiovisual resources, and nested Containers.
The single-model increment below is a delivery step, not the product ceiling.
As much implementation as possible should live in the new 3D plugin.

The recommended boundary is one plugin owning the complete active Scene:
its resource graph, spatial and temporal composition, camera, lighting, picking,
and rendering. Core supplies navigation and the generic plugin integration
contracts. Existing top-level AV presentation remains the AV plugin's concern;
media embedded within a Scene participates in the 3D plugin's composition rather
than acquiring a competing claim on that Scene. Reuse of image-resolution and
media-loading code should follow demonstrated needs through supported entrypoints.

The exact core control-routing contract, shared media implementation boundary,
and Scene-aware annotation integration remain design work. “Full support” names
the destination; the shipped support matrix must identify the draft revision,
implemented semantics, and supported asset formats.

## 1. Maturity: enough to experiment, not a finished standard

The canonical [Presentation 4 introduction](https://iiif.io/api/presentation/4.0/)
still identifies itself as **`4.0.0-draft`**, with **3.0.0** as the latest stable
version. The [Data Model](https://iiif.io/api/presentation/4.0/model/) displays
`4.0.0-` rather than a finished version string. The
[v4 JSON-LD context](https://iiif.io/api/presentation/4/context.json) returned `{}`
when fetched for this report. That prevents relying on that context for the
intended IIIF term expansion; it does **not** prevent ordinary JSON-based viewers
from implementing the draft.

The most recent commit returned by GitHub for `source/presentation/4.0/model.md`
was [6c90a8a, 2026-05-20](https://github.com/IIIF/api/commit/6c90a8a544b3fb661d0a5fc0b1d4f31cfd63c47f).
This is an observation about that file, not evidence of an imminent release or
abandonment. There is no release-date assumption in this recommendation.

Use three distinct classes of evidence:

1. **Current draft rules:** the canonical Data Model, accompanied by the
   introduction's worked examples. These are implementable but unratified.
2. **Published executable example:** the
   [simplest-3D Cookbook manifest](https://iiif.io/api/cookbook/recipe/0608-mvm-3d/v4/manifest.json).
   This is a much narrower and more useful first acceptance target than the
   entire draft.
3. **Experiments and proposals:** the [IIIF 3D TSG repository](https://github.com/IIIF/3d),
   whose README explicitly calls its manifests work in progress, and open issues
   in `IIIF/api`. Earlier experimental JSON is not automatically today's v4 JSON.

**An open issue does not by itself mean the vocabulary remains undecided.**
For example, [#2397](https://github.com/IIIF/api/issues/2397) discusses whether to
add environment lighting, but `ImageBasedLight` and `environmentMap` are already
in the [current draft](https://iiif.io/api/presentation/4.0/model/#ImageBasedLight).
Conversely, the actual text still contains inconsistencies worth avoiding in a
first slice.

## 2. What the draft actually models

### Scene is a sibling of Canvas

A Manifest's ordered `items` can mix three concrete subclasses of the abstract
Container: `Timeline`, `Canvas`, and `Scene`. A Canvas has bounded width and height;
a Scene is an **unbounded three-dimensional coordinate space**, optionally with
bounded `duration`. A Scene does not become a Canvas with a `depth` field, nor
does the draft require invented width/height bounds for it.
Sources: [Manifest](https://iiif.io/api/presentation/4.0/model/#Manifest),
[Container classes](https://iiif.io/api/presentation/4.0/model/#Containers),
[Scene](https://iiif.io/api/presentation/4.0/model/#Scene).

The familiar association remains:

`Manifest.items → Scene.items → AnnotationPage.items → painting Annotation → Model body`

`Scene.annotations` holds commentary rather than painting annotations. A Scene's
painting annotations can also introduce lights, cameras, and other Scenes.
Sources: [Containers](https://iiif.io/api/presentation/4.0/model/#Containers),
[3D content](https://iiif.io/api/presentation/4.0/#3d-content).

**IIIF Scene, engine scene graph, and glTF scene are different things.** glTF
can contain multiple scenes, nodes, meshes, cameras, and animations inside one
Model resource. An IIIF Scene can assemble multiple such resources. It is the
IIIF resource identity and coordinate frame that commentary can refer to, not
an engine object's runtime identifier.
Sources: [IIIF Content Resources](https://iiif.io/api/presentation/4.0/model/#ContentResources),
[glTF scenes](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#scenes).

### The minimal concrete JSON

This is a shortened transcription of the
[published Cookbook manifest](https://iiif.io/api/cookbook/recipe/0608-mvm-3d/v4/manifest.json),
with example.org identifiers substituted for readability. It is illustrative
JSON, not a separately published fixture:

```json
{
    "@context": "http://iiif.io/api/presentation/4/context.json",
    "id": "https://example.org/manifest",
    "type": "Manifest",
    "label": { "en": ["A 3D object"] },
    "items": [
        {
            "id": "https://example.org/scene",
            "type": "Scene",
            "label": { "en": ["A Scene"] },
            "items": [
                {
                    "id": "https://example.org/page",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": "https://example.org/painting",
                            "type": "Annotation",
                            "motivation": ["painting"],
                            "body": {
                                "id": "https://fixtures.iiif.io/3d/google/astronaut.glb",
                                "type": "Model",
                                "format": "model/gltf-binary"
                            },
                            "target": {
                                "id": "https://example.org/scene",
                                "type": "Scene"
                            }
                        }
                    ]
                }
            ]
        }
    ]
}
```

The recipe explicitly asks the viewer to place the model at the Scene origin
and supply default camera and lighting. I inspected the JSON chunk of the
[linked astronaut GLB](https://fixtures.iiif.io/3d/google/astronaut.glb): glTF 2.0,
no `extensionsUsed` or `extensionsRequired`, no cameras or animations, and no
external buffer or image URIs. **This acceptance fixture needs no Draco, KTX2,
or Meshopt decoder.** This inspection establishes asset structure, not a browser
rendering result.

### Coordinates, units, placement, and transforms

The [Scene definition](https://iiif.io/api/presentation/4.0/model/#Scene) uses a
right-handed, Y-up space: +X right, +Y up, +Z towards a viewer looking down -Z.
Coordinates can be negative and fractional. Units are arbitrary but uniformly
scaled across axes; `spatialScale` can associate them with physical units.
By comparison, [glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)
uses right-handed Y-up coordinates, metres for linear distances, and radians
for angles. Do not turn an arbitrary IIIF Scene coordinate into a claimed
physical measurement merely because the resource is glTF.

The [content-resource rule](https://iiif.io/api/presentation/4.0/model/#ContentResources)
aligns a Model's **local origin** with the Scene origin by default. A
[`PointSelector`](https://iiif.io/api/presentation/4.0/model/#PointSelector)
on the painting annotation's target places that origin at a specified Scene
point. It does not position the model's bounding-box centre. Recommendation:
frame the camera around bounds for usability while preserving authored geometry
and its origin.

Transforms live on a `SpecificResource`, normally wrapping the body to be
painted. The draft defines `ScaleTransform`, `RotateTransform`, and
`TranslateTransform`, each with `x`, `y`, `z`. The ordered `transform` array
applies before painting into the destination Scene; order matters, and repeated
operations of the same type are allowed. Defaults are scale 1, rotation 0,
translation 0. Negative scale reflects. Rotation is in **degrees**, about the
local origin, with X/Y/Z Euler ordering stated in the draft.
Sources: [Transforms](https://iiif.io/api/presentation/4.0/model/#Transforms),
[`transform`](https://iiif.io/api/presentation/4.0/model/#transform).

For example, the following painting annotation combines local transformations
with destination placement. This is an illustrative construction using those
rules and the [configured-Scene example](https://iiif.io/api/presentation/4.0/#configured-scene):

```json
{
    "id": "https://example.org/painting/2",
    "type": "Annotation",
    "motivation": ["painting"],
    "body": {
        "id": "https://example.org/model-use/2",
        "type": "SpecificResource",
        "source": {
            "id": "https://example.org/model.glb",
            "type": "Model",
            "format": "model/gltf-binary"
        },
        "transform": [
            { "type": "ScaleTransform", "x": 2, "y": 2, "z": 2 },
            { "type": "RotateTransform", "y": 90 }
        ]
    },
    "target": {
        "id": "https://example.org/placement/2",
        "type": "SpecificResource",
        "source": { "id": "https://example.org/scene", "type": "Scene" },
        "selector": [{ "type": "PointSelector", "x": -1, "y": 0, "z": 1 }]
    }
}
```

For later implementation, retain the order rather than collapsing the input
into one conventional scale/rotation/translation triple. Test multi-axis rotation
against explicit expected points: [#2285](https://github.com/IIIF/api/issues/2285)
records historical disagreement and a Manifesto implementation using local XYZ
Euler axes. Merely finding an engine enum named `XYZ` is insufficient evidence
that all composition conventions match.

### Cameras and lights are painted resources

| Feature            | Current draft vocabulary and semantics                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Camera types       | `PerspectiveCamera` with vertical `fieldOfView` in degrees; `OrthographicCamera` with `viewHeight`; both have `near`, `far`, and optional `lookAt`. [Camera classes](https://iiif.io/api/presentation/4.0/model/#Camera)                                                                         |
| Initial camera     | First defined non-hidden camera is the default. When none is available, the client must provide one. Unspecified camera position is the origin; unspecified direction is -Z. [Camera](https://iiif.io/api/presentation/4.0/model/#Camera)                                                        |
| Camera placement   | A painting annotation targets a Scene point; the camera body specifies projection and orientation. See the complete [configured example JSON](https://iiif.io/api/presentation/4.0/example/uc06_3d_annotation.json).                                                                             |
| Interaction        | Ordered preferences: `locked`, `orbit`, `hemisphere-orbit`, `free`, `free-direction`. The client should use the first it supports; these are not all synonymous with orbit controls. [`interactionMode`](https://iiif.io/api/presentation/4.0/model/#interactionMode)                            |
| Lights             | `AmbientLight`, `DirectionalLight`, `ImageBasedLight`, `PointLight`, `SpotLight`. Missing Scene lighting requires client defaults. [Light](https://iiif.io/api/presentation/4.0/model/#Light)                                                                                                    |
| Intensity          | A `Quantity`, e.g. `{ "type": "Quantity", "quantityValue": 0.5, "unit": "relative" }`, in the range 0–1. This is not an engine's physical light-unit value. [`intensity`](https://iiif.io/api/presentation/4.0/model/#intensity)                                                                 |
| Environment        | `ImageBasedLight.environmentMap` is an Image with `id`, `type`, and `profile`; the example uses `profile: "equirectangular"`, `format: "image/vnd.radiance"`. [`environmentMap`](https://iiif.io/api/presentation/4.0/model/#environmentMap)                                                     |
| Direction and cone | Directional and spot lights default to -Y; `lookAt` or rotation changes their direction. Spot `angle` describes the cone radius in degrees. [DirectionalLight](https://iiif.io/api/presentation/4.0/model/#DirectionalLight), [SpotLight](https://iiif.io/api/presentation/4.0/model/#SpotLight) |
| Embedded resources | Painting-annotation `exclude` may remove `audio`, `animations`, `cameras`, `lights` from a model or nested Scene before import. These cannot subsequently be reactivated. [`exclude`](https://iiif.io/api/presentation/4.0/model/#exclude)                                                       |

Do not promise identical lighting across engines: the draft explicitly leaves
decay, range, and penumbra client-dependent. [#2398](https://github.com/IIIF/api/issues/2398)
records Voyager's concern that differing decay defaults can turn an apparently
well-lit Scene into a dark one. An engine's PBR capabilities do not resolve this
interoperability decision.

### Composition, commentary, and camera-linked annotations

- **Composition is broader than multiple models.** Scenes can be painted into
  Scenes. Images and videos must first be painted onto Canvases; those Canvases
  can then be painted into a Scene. A Canvas uses its top-left origin, faces +Z
  by default, and has 1:1 coordinate scaling after transforms. Audio enters
  through `AmbientAudio`, `PointAudio`, or `SpotAudio`, whose source can include
  a Timeline. See [Content Resources](https://iiif.io/api/presentation/4.0/model/#ContentResources)
  and [Audio Emitters](https://iiif.io/api/presentation/4.0/model/#AudioEmitters).
- **Selecting and displaying are different.** A commentary target can use a
  `SpecificResource` with a `PointSelector` (`x`, `y`, `z`) or `WktSelector`
  (`value` containing WKT geometry). The body's `position` can separately
  indicate where its text should appear. See [Selectors](https://iiif.io/api/presentation/4.0/model/#Selectors),
  [`position`](https://iiif.io/api/presentation/4.0/model/#position), and
  [commenting about sculpture](https://iiif.io/api/presentation/4.0/#commenting-about-3d-sculpture).
- **Camera-linked comments are already described, but are a substantial feature.**
  The introduction demonstrates `motivation: ["activating"]` annotations that
  show, enable, and select a hidden camera when a comment is selected. A comment's
  `scope` provides shorthand for this operation. This is more than saving a
  library-specific orbit vector in an annotation. See
  [3D comments with cameras](https://iiif.io/api/presentation/4.0/#3d-comments-with-cameras)
  and [scope shorthand](https://iiif.io/api/presentation/4.0/#using-scope-to-select-a-camera).
- **Animations are separate again.** `AnimationSelector` identifies named model
  animations, while activating annotations express actions. Asset animation
  decoding is not implementation of IIIF activation semantics. See
  [AnimationSelector](https://iiif.io/api/presentation/4.0/model/#AnimationSelector)
  and [triggering model animations](https://iiif.io/api/presentation/4.0/#triggering-model-animations).

### Known gaps between rules, examples, and proposals

These are specific reasons to defer richer interoperability rather than treating
all of 3D as equally unsettled:

| Topic                         | Evidence and consequence                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lookAt` precedence           | The [current text](https://iiif.io/api/presentation/4.0/model/#lookAt) says it follows transforms and overrides X/Y rotation while retaining Z rotation. [#2430](https://github.com/IIIF/api/issues/2430) proposed a different precedence; the editor's response explains the adopted wording. Do not implement the original proposal instead of the text.                                 |
| `lookAt` allowed values       | The same section initially allows PointSelector, WktSelector, Annotation reference, or SpecificResource, but its later “must” sentence only lists Annotation reference or PointSelector. This is a real internal inconsistency.                                                                                                                                                            |
| Directional light orientation | [#2486](https://github.com/IIIF/api/issues/2486) remains open: a positionless directional light still needs a reference position to calculate `lookAt`. Defaults and transforms also need clarification.                                                                                                                                                                                   |
| Model-instance commentary     | [#2421](https://github.com/IIIF/api/issues/2421) debates nested Scenes versus targeting the painting annotation. The [current sculpture prose](https://iiif.io/api/presentation/4.0/#commenting-about-3d-sculpture) says the comment targets the painting annotation, but its displayed JSON targets the Scene. Avoid defining a persistent instance-targeting contract from this example. |
| Surface identity and pivots   | [#2255](https://github.com/IIIF/api/issues/2255) (model-part selectors) and [#2273](https://github.com/IIIF/api/issues/2273) (model pivot definition) are marked deferred. A raycast mesh index or a model-viewer surface string is not thereby a portable IIIF selector.                                                                                                                  |
| Storytelling/navigation       | [#2424](https://github.com/IIIF/api/issues/2424) proposes Range navigation triggering activating annotations; [#2422](https://github.com/IIIF/api/issues/2422) concerns non-prescriptive scene states. Do not assume existing Range navigation supplies a full tour engine.                                                                                                                |
| Environment lighting          | Already in the draft despite open [#2397](https://github.com/IIIF/api/issues/2397). For nested Scenes, the [current content-resource rule](https://iiif.io/api/presentation/4.0/model/#ContentResources) permits ignoring the nested image-based light when both Scenes have one. This is deliberately weaker than blending all environments.                                              |

## 3. Model formats and delivery

IIIF's `Model` identifies a content-resource category, not a mandated mesh file
format or a new tiling service. The content-resource definition explicitly
applies regardless of file format. A viewer must publish its actual format
subset. Sources: [`type`](https://iiif.io/api/presentation/4.0/model/#type),
[Content Resources](https://iiif.io/api/presentation/4.0/model/#ContentResources).

**Prefer glTF 2.0, initially its GLB packaging.** Khronos specifies
`model/gltf+json` for `.gltf` and `model/gltf-binary` for `.glb`; glTF describes
scene hierarchy, materials, textures, cameras, and animations. Its design is
runtime asset delivery, not an editing interchange format. GLB can still refer
to external resources, so “GLB” does not guarantee one HTTP request. Sources:
[glTF basics](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#gltf-basics),
[media types](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#file-extensions-and-media-types),
[GLB buffers](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-stored-buffer).

Compression features are independent capabilities:

- `KHR_draco_mesh_compression`: compressed mesh data, requiring a Draco decoder.
- `EXT_meshopt_compression`: compressed buffer data, requiring Meshopt support.
- `KHR_texture_basisu`: KTX2/Basis Universal textures, requiring transcoding for
  the target GPU.

These are listed with explicit decoder setup in
[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) and
[Babylon's glTF loader documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md).
Do not infer “all compressed glTF works” from a basic uncompressed GLB passing.
Pin supported extension names to the selected dependency version; live Three.js
documentation now also lists `KHR_meshopt_compression`.

There are no bundle-size figures here: none were measured. A useful later
measurement must include the selected renderer, loaders, decoder JavaScript/WASM,
workers, and default environment assets, distinguishing initial delivery from
on-demand loads.

## 4. Rendering-library comparison

### Three.js — recommended

**License:** [MIT](https://github.com/mrdoob/three.js/blob/master/LICENSE).

- **Loading:** `GLTFLoader` exposes the imported scene, other scenes, cameras,
  animations, and parser. Draco, KTX2, and Meshopt have explicit configuration
  methods. Addons are imported separately.
  [Official loader docs](https://threejs.org/docs/pages/GLTFLoader.html).
- **Composition:** returned scene roots can be added to an enclosing scene;
  the official cleanup example itself loads external models and manipulates
  their roots. This gives the plugin direct control over each painting
  annotation's instance and transform hierarchy.
  [Loaded-model example](https://threejs.org/manual/pages/cleanup.html).
- **Picking:** `Raycaster` provides object, face, UV, instance ID, and hit point
  in world coordinates. This is enough machinery for later Scene-space point
  annotations; the application must retain the IIIF identity mapping.
  [Raycaster](https://threejs.org/docs/pages/Raycaster.html).
- **Camera:** `OrbitControls` supports orbit, dolly, pan, limits, reset, input
  configuration, and change events. It preserves Y-up; perspective and
  orthographic zoom have distinct controls. Damping requires updates while
  settling. [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).
- **Lifecycle:** geometries, textures, and materials require explicit disposal;
  removing a root is insufficient. `GLTFLoader` also warns that image bitmaps
  need explicit handling. Ownership must cover loader completion after departure,
  controls/listeners, render scheduling, renderer resources, and decoders.
  [Cleanup](https://threejs.org/manual/pages/cleanup.html),
  [GLTFLoader disposal note](https://threejs.org/docs/pages/GLTFLoader.html).
- **Accessibility:** its input APIs are useful primitives, not a semantic
  presentation of the object. Recommendation: expose DOM controls and a text
  description, and later a DOM annotation list. Scope keyboard listeners to the
  focused viewer rather than copying the docs' suggested `window` listener.

**Why this choice:** it exposes the operations the draft describes without
requiring Triiiceratops to adopt another viewer's complete interaction, document,
and annotation model. The tradeoff is explicit resource ownership and accessible
UI work. The local integration review in section 7 supports the plugin approach,
while identifying a separate presentation and input-ownership decision.

### Babylon.js — capable alternative with stronger engine-level facilities

**License:** [Apache-2.0](https://github.com/BabylonJS/Babylon.js/blob/master/license.md).

- **Loading/codecs:** official `@babylonjs/loaders` supports glTF; documentation
  covers Draco, Meshopt, and KTX2/Basis. Decoder files are fetched from its CDN by
  default and can be self-hosted; worker use is documented. Configure a
  right-handed Scene explicitly for IIIF rather than relying on engine defaults.
  [glTF documentation source](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md).
- **Composition/lifecycle:** `AssetContainer` groups nodes, cameras, lights,
  meshes, and animations; it can add/remove resources and instantiate multiple
  model copies. Instance groups have `dispose()`. Scene disposal also aborts
  active requests, detaches controls, and disposes scene resources.
  [Asset containers](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/assetContainers.md),
  [Scene source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/scene.pure.ts).
- **Picking:** ray picking, filters, multiple hits, and GPU picking are documented.
  [Mesh picking](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/interactions/picking_collisions.md).
- **Camera:** `ArcRotateCamera` supplies an orbit target, input attachment,
  panning, and distance controls; Universal/other cameras cover first-person
  interactions. [Camera documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/cameras/camera_introduction.md).
- **Accessibility:** the optional accessibility package generates HTML twins
  from `IAccessibilityTag` descriptions and actions, with keyboard interaction.
  Authors still supply the semantic descriptions and choose which objects matter.
  [Screen-reader support](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/accessibility/screenReaders.md).

**Assessment:** a technically sound choice, especially if richer 3D interaction
becomes the product. Its asset-container and HTML-twin facilities are real
advantages. The first slice does not need those extra facilities enough to
outweigh Three.js's direct fit and the IIIF/Three.js implementation references.
This is a scope judgment, not a claim that Babylon is slower or larger.

### Google `<model-viewer>` — strongest ready-made viewing experience

**License:** [Apache-2.0](https://github.com/google/model-viewer/blob/master/LICENSE).
It is a web component built on Three.js; the project recommends matching its
tested Three.js peer dependency.
[README](https://github.com/google/model-viewer/blob/master/packages/model-viewer/README.md).

- **Loading/codecs:** documented `src` supports glTF/GLB. Draco and KTX2 decoder
  locations default to Google-hosted resources and are configurable; Meshopt is
  available but disabled by default until configured.
  [Loading API](https://modelviewer.dev/docs/#loading),
  [documentation source](https://github.com/google/model-viewer/blob/master/packages/modelviewer.dev/data/docs.json).
- **Camera/picking:** `camera-orbit`, `camera-target`, field of view, constraints,
  camera-change events, and `jumpCameraToGoal()` provide a substantial viewing
  API. `positionAndNormalFromPoint()` returns a mesh hit; `surfaceFromPoint()`
  supports animated surface attachments. Hotspot slots are real DOM children.
  [Camera API](https://modelviewer.dev/docs/#stagingandcameras),
  [annotations API](https://modelviewer.dev/docs/#annotations).
- **Composition deserves a qualification:** the documented `src` path is
  centred on a loaded asset, but current upstream source also contains
  **`<extra-model>`**, with `src`, `offset`, `orientation`, and `scale`.
  Therefore “model-viewer cannot compose models” is too strong. That feature is
  visible at the inspected master commit
  [297ed2b](https://github.com/google/model-viewer/blob/297ed2bdbea0c8f921d985ff0c71afd3a819e12e/packages/model-viewer/src/features/extra-model.ts);
  this research did not establish which published package includes it. It also
  does not establish arbitrary IIIF camera/light/nested-Container support.
- **Lifecycle:** disconnect unregisters the scene, removes observers/listeners,
  and schedules scene disposal. Its model cache is separately configured by a
  static, count-based setting; element removal is not proof of immediate complete
  eviction. [Lifecycle source](https://github.com/google/model-viewer/blob/297ed2bdbea0c8f921d985ff0c71afd3a819e12e/packages/model-viewer/src/model-viewer-base.ts),
  [cache API](https://modelviewer.dev/docs/#entrydocs-loading-staticProperties-modelCacheSize).
- **Accessibility:** `alt`, translated orientation descriptions, keyboard
  interaction prompts, and DOM hotspots offer the strongest ready-made starting
  point of these three. They still need meaningful publisher/host descriptions
  and accessible controls for application-specific actions.
  [Loading and accessibility API](https://modelviewer.dev/docs/#loading).

**Assessment:** excellent if the intended product is specifically “show one
model with a polished accessible orbit viewer.” For an IIIF Scene plugin,
authored cameras, independent lights, instance identity, and ordered composition
are clearer with direct engine access. The documented external-renderer escape
hatch disables model-viewer's glTF-related lighting, animation, AR, and scene-graph
features, so it should not be counted as free preservation of those features.
[External renderer API](https://modelviewer.dev/docs/#entrydocs-loading-methods-registerRenderer).

## 5. Existing IIIF 3D implementations: useful precedents, different contracts

### Smithsonian Voyager

[Voyager](https://github.com/Smithsonian/dpo-voyager) is an Apache-2.0 tool suite:
Story authors presentations, annotations, articles, and tours; Explorer and Mini
are viewer components. The repository still describes the software as
pre-release. Its normal document format is **SVX**, not IIIF Presentation JSON.
[Repository and license](https://github.com/Smithsonian/dpo-voyager),
[SVX overview](https://smithsonian.github.io/dpo-voyager/document/overview/).

The [official Explorer API](https://smithsonian.github.io/dpo-voyager/explorer/api/)
documents GLTF/GLB model loading, OBJ/PLY geometry, a configurable Draco root,
camera orbit/offset, annotation activation with associated camera views, tours,
measurement, tags, and multiple model load states. These are valuable cultural
heritage interaction precedents. That API page does not establish KTX2 or
Meshopt support, a general hit-test API, or a complete disposal contract; those
capabilities remain unverified here rather than being inferred from Three.js.

There is concrete experimental IIIF work: the repository's
[`dev-iiif-rebase` reader](https://github.com/Smithsonian/dpo-voyager/blob/dev-iiif-rebase/source/client/io/IIIFManifestReader.ts)
imports `@iiif/3d-manifesto-dev`, obtains Scenes, and combines their content and
non-content annotations. This establishes a prototype integration, not stable
current-draft support in the normal Explorer release. Its developer also raises
practical lighting/export concerns in
[#2397](https://github.com/IIIF/api/issues/2397) and
[#2398](https://github.com/IIIF/api/issues/2398).

**Use as a reference for authored presentations and interoperability fixtures.**
Embedding it would introduce a second viewer/document model. Its reader and
annotation UI are relevant accessibility affordances, but no complete
screen-reader/keyboard conformance result was established from these sources.

### Aleph: distinguish the original and React implementations

The original [Aleph](https://github.com/aleph-viewer/aleph) is MIT-licensed and
built with A-Frame, AMI, Stencil, and Ionic. It documents Universal Viewer
integration, glTF with Draco, DICOM volumes, surface point annotations, and
length/angle measurements. Its web-component API exposes `load`, `resize`,
`recenter`, controls selection, and graph editing.
[Component API](https://github.com/aleph-viewer/aleph/blob/master/src/components/al-viewer/readme.md).
That documentation does not establish KTX2/Meshopt support, an arbitrary
multi-resource IIIF Scene compositor, or a teardown guarantee.

The more directly relevant [Aleph-R3F](https://github.com/aleph-viewer/aleph-r3f)
is an [MIT-licensed](https://github.com/aleph-viewer/aleph-r3f/blob/main/LICENSE)
React/react-three-fiber viewer. Its README explicitly describes glTF/GLB
collections with independent transforms, image planes in 3D, CT/MRI volumes,
annotations with captured camera positions, perspective/orthographic cameras,
interaction constraints, environment maps, and a Universal Viewer extension for
Presentation 4. Treat that as the project's stated integration, not a claim of
complete conformance to the current draft.

Its [model component](https://github.com/aleph-viewer/aleph-r3f/blob/main/src/components/gltf.tsx)
uses Drei `useGLTF(url, true, true, ...)`, clones the scene, and wraps it in a
position/rotation/scale group. The two flags enable Draco and Meshopt according
to [Drei's API](https://drei.docs.pmnd.rs/loaders/gltf-use-gltf); KTX2 requires
additional loader configuration, which this component does not supply. This is
a concrete composition/loading reference. Do not infer all of current
Three.js's extension support from it: the inspected
[package manifest](https://github.com/aleph-viewer/aleph-r3f/blob/main/package.json)
pins its own Three.js dependency. Complete cache/disposal behaviour and
assistive-technology coverage were not verified in this source review.

**Use as the closest feature precedent**, especially annotation/camera UX and
the consequences of multi-model placement. Adopting the whole viewer would also
adopt its React-based UI and state choices, rather than just a rendering library.

### TSG prototypes and Manifesto-3D

The TSG's [experiment milestones](https://iiif.github.io/3d/demo/EXPERIMENTS)
progress from one model through cameras, lights, transforms, nested Containers,
exclusion, timed Scenes, and commentary. This is a useful future fixture ladder,
but each experimental manifest needs comparison with the current canonical
vocabulary before use.

The earlier [Issue 17 demos](https://iiif.github.io/3d/demo/JSON_DEMOS_ISSUE_17)
include Aleph, model-viewer, Voyager, Sketchfab, and X3D using a small shared JSON
annotation format. The TSG explicitly identifies those as an older exercise:
they do **not** demonstrate v4 Manifest support.

[Manifesto-3D](https://github.com/IIIF-Commons/manifesto-3d) is a development fork
following the draft. It links Three.js, X3DOM, and Voyager prototype viewers and
records changes to target handling, camera properties, and `lookAt`. It is a
useful source of interpretation and cross-renderer examples, not evidence that
Triiiceratops should take on that parser as a dependency.

## 6. Recommended first vertical slice

**Recommended scope:** one active, static Scene containing one directly painted
glTF 2.0 GLB Model, at the origin, using default camera and lighting. Support
the exact published simplest-3D recipe first. This is a proposed product subset,
not a restriction imposed by IIIF.

1. **Load and show the real Cookbook object.** Preserve the Scene ID, painting
   annotation ID, model URI, authored origin, and asset coordinates. Compute
   bounds only to frame the initial camera.
2. **Provide a usable view.** Default perspective camera, neutral default
   lighting, orbit, zoom, and return-to-initial-view. Use no automatic spin or
   automatic animation playback. Default lighting is explicitly permitted and
   required when none is authored by the [draft](https://iiif.io/api/presentation/4.0/model/#Light).
3. **Make the view operable and understandable.** DOM controls for the supported
   camera actions, keyboard focus confined to the active viewer, instructions,
   a meaningful text description, and a visible loading/error/fallback state.
   A publisher thumbnail can accompany the fallback; metadata remains readable.
4. **Finish the lifecycle in this slice.** Resize correctly; leaving the Scene
   stops its input/render activity; late loads cannot install stale content;
   departing resources are disposed; two viewer instances remain independent.
   Treat these as acceptance criteria rather than assuming removing a canvas
   frees GPU resources.
5. **Publish the limits.** Authored cameras/lights, transforms, multiple painting
   bodies, nested Containers, timed Scenes, activated actions, and persistent 3D
   annotation editing are outside this slice. Detect unsupported presentation
   structure rather than silently showing its first Model as if it were complete.
   The initial asset profile is an uncompressed, self-contained, static GLB;
   richer assets need an explicit support decision.

The canonical astronaut demonstrates this without codec work. Draco, KTX2, and
Meshopt should follow when backed by an actual input requirement and a fixture
for each advertised extension. Decoder locations and delivery become part of
that capability's packaging, not an implicit third-party network dependency.
Similarly, OBJ/PLY/USDZ, DICOM, point clouds, splats, AR, and measurement do not
belong in a first mesh-viewing slice just because a candidate engine can support
some of them.

Suggested verification for the later implementation:

- The published [Cookbook manifest](https://iiif.io/api/cookbook/recipe/0608-mvm-3d/v4/manifest.json)
  renders a visible, correctly oriented astronaut, and framing changes the camera
  rather than moving the model origin.
- Orbit, zoom, and reset work with pointer and keyboard/DOM controls; focus can
  leave the viewer normally; resizing preserves a usable view.
- Navigate away while loading and back after loading; remove the plugin; mount
  two viewers. No stale scene, continued background loop, or cross-viewer input.
- Network/parse/WebGL failures and unsupported composition yield an honest
  fallback with the descriptive content still usable.
- Only the selected 3D capability loads its renderer/assets; inspect actual
  built artifacts before making a shipped-size claim.

**Next slice, if justified:** two static Model painting annotations with
PointSelector placement and ordered transforms, followed by one explicit
perspective camera and one explicit light. That follows the TSG's concrete
fixture ladder. Commentary persistence and tours should wait for a separate
decision about Scene versus model-instance targets and camera activation.

## 7. Triiiceratops integration findings

### The plugin boundary is already the right one

[ADR 0017](../docs/adr/0017-av-is-a-plugin-over-a-generic-canvas-claim.md)
explicitly anticipates a future 3D plugin using the generic canvas claim. Source
inspection supports that direction, with an important distinction between an
existing mechanism that accepts a Scene ID and a published Scene-aware contract:

| Concern           | Existing seam and implication                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enumeration       | [`getCanvasesForSequence`](../packages/core/src/lib/utils/iiifParsing.ts) enumerates manifest items without requiring `type: Canvas`. The earlier research measured the simplest Scene surviving registration. The plugin can discover it through `viewerState.canvases`, despite that member's Canvas-oriented name.                                       |
| Honest baseline   | [`paintingBodies.ts`](../packages/core/src/lib/utils/paintingBodies.ts) classifies the typed Model as non-image. [`toPlannerCanvas`](../packages/core/src/lib/renderer/canvasDescriptors.ts) retains a non-image-only item with an empty image list and nullable dimensions. Core therefore already has an unsupported presentation for the simplest Scene. |
| Ownership         | [`claimCanvas`](../packages/core/src/lib/state/viewer.svelte.ts) validates the ID and activation owner, not the IIIF resource class. It can mechanically claim a Scene ID today. This suppresses the unsupported presentation; it grants neither a 3D camera nor input ownership.                                                                           |
| Rendering surface | [`registerOverlayLayer`](../packages/core/src/lib/renderer/overlayLayers.ts) supplies a plugin-owned DOM mount beside the renderer. A plugin can put its own WebGL canvas and accessible DOM controls there. The core paint hook's 2D context is not the appropriate rendering surface.                                                                     |
| Host integration  | [ADR 0018](../docs/adr/0018-published-plugin-state.md) supplies the published-state pattern. Camera commands, loading/error facts, and later selected annotations should be reached through `viewerState.getPluginState(pluginId)`, with types supplied by the plugin.                                                                                      |
| Distribution      | [`plugin-av/vite.config.ts`](../packages/plugin-av/vite.config.ts) already demonstrates optional chunks used by both ESM and script-tag entrypoints. Three.js and its loader belong in the 3D plugin's on-demand chunk, with no engine import in core.                                                                                                      |

**Recommended ownership:** core continues to own manifest navigation, descriptive
chrome, activation, and placement of the plugin surface. The 3D plugin owns Scene
interpretation, asset loading, camera and lighting, input within its surface,
render scheduling, and GPU resource disposal. Keep Three.js objects private to the
plugin; expose the supported user actions through published state. A small
plugin-local parser is sufficient for the first recipe; a new general-purpose IIIF
parser dependency is not justified by it.

### The real integration decision is the viewing surface

The AV stage follows a bounded rectangle obtained from `canvasSize` and
`canvasToScreen`, then repositions on the viewer's frame cadence. See
[`rectFor` and `placeAll`](../packages/plugin-av/src/stages.svelte.ts).
For dimensionless content that rectangle is a layout allocation, derived from
core's fallback sizing. It is **not the coordinate space of an unbounded IIIF
Scene**. Passing an `(x, y)` Scene point through `canvasToScreen`, or adding `z`
to that existing helper, would give the wrong projection.

Two reader experiences are possible:

- **A 3D viewport inside a 2D layout slot:** closest to AV and useful for a
  feasibility prototype. The outer viewer can pan/zoom the slot while the inner
  camera orbits its model. This can coexist with continuous layouts, but creates
  two different zoom operations and requires an explicit way to distinguish them.
- **The current Scene fills the stage:** recommended first product experience.
  Navigation selects a Scene, and gestures manipulate its camera. Image Canvases
  continue to use the 2D renderer when selected. This avoids teaching the reader
  an outer zoom for a Scene that has no finite outer bounds.

The latter recommendation requires deciding how the viewer's built-in zoom/fit
controls behave while a Scene is current, and how continuous/paged layouts expose
Scenes. [`ViewerControls.svelte`](../packages/core/src/lib/components/ViewerControls.svelte)
currently calls core's `zoomIn`, `zoomOut`, and `fitView` directly. Merely filling
an overlay with WebGL would leave those buttons operating the obscured 2D layout.
For a first implementation, recommend explicit single-current-Scene interaction
and a supported core mechanism for the relevant controls to address the active
presentation. The exact command-routing contract and treatment of other viewing
modes should be resolved before implementation, rather than hidden in plugin CSS
or a silent configuration override. This is the principal core design work;
importing a rendering engine is the easier part.

### Input is not solved by a canvas claim

The existing event topology narrows what actually needs changing. In
[`canvasRenderer.svelte.ts`](../packages/core/src/lib/renderer/canvasRenderer.svelte.ts):

- Pointer gestures are attached to the renderer surface; an overlay is its
  sibling. The AV plugin deliberately forwards a pointer-down to that surface
  in [`onLaneTap`](../packages/plugin-av/src/mediaStage.ts) so a drag pans the
  image. A 3D surface should handle its own pointer gestures instead.
- Wheel handling is on the shared stage. `handleStageWheel` returns when the
  event is already `defaultPrevented`. The 3D controls must consume wheel events
  they use, so one gesture cannot dolly the camera and zoom the outer viewer.
- Stage pointer handling redirects focus to core unless the target is already
  prevented or belongs to a focusable control. A focusable, labelled 3D surface
  with its own scoped keyboard handling fits this arrangement; a bare canvas
  without focus handling does not.

These existing behaviours may be sufficient for the first surface's input;
verify touch/pinch and pointer capture in the real browser integration. Do not
invent an input-claim dependency before that verification: the glossary's
**Input claim** is explicitly unshipped and pointer-only. Even a future input
claim would not, by itself, route wheel, keyboard, or toolbar commands.

### Geometry, scheduling, and lifecycle remain plugin-owned

Use the 3D camera to project Scene-space coordinates into the plugin surface's
screen space. Core's coordinate helpers can position a bounded plugin viewport,
but cannot pick a point on a mesh. For later commentary, preserve the Scene and
painting-annotation identities beside engine nodes and use raycasting for picking.
The existing [`extractPointFromSelector`](../packages/core/src/lib/utils/annotationAdapter.ts)
reads `x` and `y` and returns a 2D point; it does not preserve `z`. Reusing the
current annotation geometry path would flatten a 3D target. Persistent 3D
annotations need a separate reviewed integration with the annotation editor's
store and adapter contract, not just another drawing tool.

Core's frame cadence reflects movement of the 2D renderer. Orbiting a 3D camera
does not necessarily move it. The plugin therefore needs its own invalidation:
render on load, resize, camera change, and while damping settles; stop when idle
or inactive. Publish continuous camera observations on the plugin's own cadence
if needed, following the AV published-state pattern. A permanent animation loop
is unnecessary for a static object.

For the proposed single-active-Scene experience, use at most one live WebGL
renderer per viewer activation, created lazily. Do not copy AV's allocation of
one stage per claimed item into one WebGL context per manifest Scene. Dispose
departing asset resources and stale async results, and handle context loss with
a usable fallback. Multiple viewer instances must remain isolated. This is a
recommended resource policy, not a measured browser context limit.

### Concrete v4 gaps to keep visible

- [`parseV3Range`](../packages/core/src/lib/utils/structures.ts) accepts typed
  Canvas references, SpecificResources, and strings, but not typed Scene
  references. Once Scene navigation through Ranges is in scope, core needs that
  targeted change; a rendering library cannot supply it.
- [`companionCanvases.ts`](../packages/core/src/lib/renderer/companionCanvases.ts)
  implements the v3 companion names. A Scene's v4 `placeholderContainer` cannot
  be assumed to work through the existing companion phase without checking and
  extending that resolution. The minimal recipe requires no companion.
- Simple Model-only Scenes exercise the current unsupported classifier well.
  Richer Scenes containing nested Containers, lights, and cameras need explicit
  classification and fallback fixtures; success on the astronaut is not evidence
  that all such shapes retain correct layout or thumbnails.

**Implementation gate:** first prove the published recipe in a disposable plugin
integration, including input isolation, navigation away/back, and teardown. Then
settle the stage/controls policy and ship that narrow capability. Rendering-library
selection can be made now; the Scene presentation contract deserves its own
decision before a production implementation.

## 8. Remaining uncertainties and decision triggers

- The draft and its examples need reconciliation around `lookAt`, commentary
  instance targets, and lighting defaults. Changes should be tracked at those
  specific [IIIF issues](https://github.com/IIIF/api/issues?q=is%3Aopen+label%3A3d),
  not inferred from aggregate open-issue counts.
- No library was benchmarked or exercised in a browser in this research. Bundle
  cost, decoded/GPU memory, cancellation behaviour across every asset request,
  mobile performance, and assistive-technology behaviour remain implementation
  verification work.
- Library repository HEAD is not a release guarantee. In particular, verify
  `<extra-model>` availability against an actual chosen model-viewer package
  before using it as a reason to prefer that component.
- Existing implementations establish feasibility and expose interoperability
  problems; none of the sources inspected establishes a comprehensive current-v4
  conformance suite.
- The first decision trigger is whether the published simplest-model recipe is
  a worthwhile product addition. Broader support should be driven by concrete
  manifests and reviewed feature requirements, with vocabulary pinned to a
  recorded draft snapshot.

## Primary-source starting points

- Current specification: <https://iiif.io/api/presentation/4.0/>
- Formal vocabulary: <https://iiif.io/api/presentation/4.0/model/>
- First acceptance manifest: <https://iiif.io/api/cookbook/recipe/0608-mvm-3d/v4/manifest.json>
- TSG experiment ladder: <https://iiif.github.io/3d/demo/EXPERIMENTS>
- Three.js loader: <https://threejs.org/docs/pages/GLTFLoader.html>
- Babylon loader documentation: <https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md>
- model-viewer API source: <https://github.com/google/model-viewer/blob/master/packages/modelviewer.dev/data/docs.json>
- Voyager: <https://github.com/Smithsonian/dpo-voyager>
- Aleph-R3F: <https://github.com/aleph-viewer/aleph-r3f>
