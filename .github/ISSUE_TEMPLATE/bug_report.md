name: "Bug Report"
description: "Report a reproducible problem"
labels: [bug]
assignees: []
body:
  - type: textarea
    id: what
    attributes:
      label: What happened?
      placeholder: Expected vs actual
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: textarea
    id: env
    attributes:
      label: Environment
      description: OS, browser/Electron, Node, commit
