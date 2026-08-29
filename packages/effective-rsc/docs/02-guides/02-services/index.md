## Services

Define services with Effect, then follow the ERSC composition convention:

1. Declare the complete service union with `Application.ersc<Services>()`.
2. Let Pages, Layouts, Components, and Server Functions require members of that union.
3. Provide the complete Layer once with `ERSC.make({ layer })`.

This keeps implementations at the application composition boundary while preserving each
renderer's inferred service requirements.
