# P095 - Custom Templates and Shape Library

## Goal
To enable users to save selections of objects or entire canvas layouts as reusable custom templates within a personalized shape library, speeding up the creation process for recurring diagrams and structures.

## Problem
Currently, users who frequently create similar diagrams (like flowcharts, UI wireframes, or specific architectural models) must manually reconstruct these complex grouped objects from scratch every time, or tediously copy-paste them from older rooms. This repetition reduces efficiency and disrupts the creative workflow, lacking the component reusability expected in modern whiteboard tools.

## Proposed Changes
1. **Schema Update**: Introduce a `ShapeTemplate` model to store the serialized JSON of grouped objects (or full canvas states) associated with a `User`.
2. **Library UI Panel**: Add a new "Shape Library" sidebar panel to the canvas interface, allowing users to view, search, and manage their saved templates.
3. **Save/Load Logic**: Implement a "Save as Template" action in the context menu for selected canvas objects. When dragged from the library, the system will instantiate the stored JSON onto the canvas.
4. **Thumbnail Generation**: Automatically generate and store a lightweight SVG or PNG thumbnail representation of the template upon creation for display in the library sidebar.
5. **API Endpoints**: Create CRUD API endpoints to manage a user's collection of saved templates.

## Future Press Release
Stop reinventing the wheel on every new whiteboard! SketchGit introduces the Custom Templates and Shape Library. We know that many workflows require reusing the same complex diagrams, custom UI components, and tailored flowcharts. Now, you can simply select any group of objects on your canvas and save them as a custom template with a single click. Access your personalized Shape Library at any time to instantly drag and drop your frequently used structures right back into the action. Build faster, stay consistent, and save time with SketchGit!

## Definitions of Done

### Implementation
- `ShapeTemplate` database schema created to store object metadata, serialized state, and user associations.
- Canvas context menu updated with a "Save as Template" option for active selections.
- Backend logic implemented to sanitize and strip unique IDs from serialized objects before saving as a template.
- Thumbnail generation process implemented (either client-side before upload or server-side).
- "Shape Library" sidebar panel developed and integrated into the main canvas UI, supporting drag-and-drop instantiation.

### Testing
- Unit tests written for the template serialization/deserialization logic, ensuring robust handling of all supported Fabric.js object types.
- Integration tests validating the template CRUD API endpoints.
- End-to-end (E2E) tests simulating the saving of an object group and subsequently dragging it from the library back onto the canvas.
- Coverage remains at or above the required project threshold.

### Documentation
- User guide updated with tutorials on how to create, manage, and use custom templates.
- Developer documentation updated describing the serialization format and storage mechanism for templates.

### Security
- The JSON serialization and deserialization process must strictly validate inputs to prevent malicious payloads or XSS injection when rendering templates.
- Ensure proper access controls so a user can only read, update, or delete their own templates.

### Reliability
- The template loading mechanism must efficiently handle instantiating complex groupings without blocking the main browser thread or causing significant frame drops.
- Implement pagination and lazy loading in the Shape Library sidebar to maintain performance when a user has a large number of saved templates.

### Accessibility
- The Shape Library sidebar must be fully keyboard navigable, allowing users to browse and insert templates without a mouse.
- Meaningful ARIA labels and descriptions must be associated with the template thumbnails for screen readers.

### GDPR compliance
- Custom templates represent user-generated content; they must be fully included when a user initiates a data export request.
- All stored templates must be permanently deleted if the associated user requests account deletion.
