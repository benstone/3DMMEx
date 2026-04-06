# Contributing to 3DMMEx

Thanks for contributing to the 3DMMEx project!

Currently the project is focused on making the classic 3DMM experience work well on modern machines. This includes portability and minor usability improvements. Contributions towards these goals are welcome!

## Bug reporting

To report a bug, create a GitHub Issue. Make sure you include the following information in the bug report:

* Describe the behaviour you are expecting and what actually happens
* Provide any information needed to reproduce the problem, including:
    * What version of 3DMMEx are you using? (you can check this by pressing Ctrl-Shift-I)
    * What operating system are you using?
* Include a screenshot if the problem is something visual

## Contributing code

Check out the [README](README.md) for information about how to build and test 3DMMEx.

### Architecture

The 3DMMEx project has several components:

* Kauai: application framework
* BRender: 3D rendering engine. 3DMMEx can be built to use the original static libraries from the 3D Movie Maker source code release or a [fork of the source code release](https://github.com/benstone/3DMM-BRender).
* AudioMan: a sound mixing library used in Windows builds. 3DMMEx uses a [decompilation of the AudioMan static libraries](https://github.com/benstone/audioman-decomp) from the original source code release.
* Socrates/3D Movie Maker: the application
* Chomp: script compiler
* Ched/Chelp: authoring tools

### Coding style

Please use the included clang-format configuration to format your code. There is a GitHub Action that will check the format of your code when you create a pull request. If this check fails, the output will show a diff of what changes are needed to format the code correctly.

The original 3D Movie Maker source code uses a variant of Microsoft's Apps Hungarian coding style. Please read [Hungarian Notation by Doug Klunder](https://idleloop.com/hungarian/) for an overview of the code style.

In 3DMMEx we prefer to retain the Apps Hungarian style when modifying existing 3D Movie Maker code. This will keep the style consistent across the codebase.

Please use the Kauai framework's data structures and types, for example the STN class for strings and the GL class for lists. These types are preferred over using the C++ STL for consistency with existing code.

If in doubt, try to find existing code that is similar to what you are writing and emulate that code's style.

### Testing

3DMMEx uses Google Test for unit tests. You can run these using CMake's CTest command: `ctest --test-dir build/<preset-name>`. Currently the unit tests only provide basic smoke testing of the Kauai framework. These tests also run automatically in GitHub Actions.

Before submitting your PR, you should manually test your changes. When testing, you should use the Debug configuration as it has assertions enabled. Assertions help to identify bugs by checking invariants. Debug builds also perform memory leak checking to ensure that all allocated objects are accounted for.

**NOTE:** It is very important that any changes you make do not affect the file format. We want 3DMMEx to be able to load all movies created with the original release of 3D Movie Maker from 1995. We also want movies created with 3DMMEx to play in original releases of 3D Movie Maker without issues.

### Licensing

Any code you submit will be licensed under the MIT license.
