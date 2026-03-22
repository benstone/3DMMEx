include(FindPackageHandleStandardArgs)

find_library(${CMAKE_FIND_PACKAGE_NAME}_LIBRARY
  NAMES fluidsynth fluidsynth3 libfluidsynth3)

find_package_handle_standard_args(${CMAKE_FIND_PACKAGE_NAME}
  REQUIRED_VARS ${CMAKE_FIND_PACKAGE_NAME}_LIBRARY)
