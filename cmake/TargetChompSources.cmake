include_guard(GLOBAL)

set(CHOMP_PATH CACHE PATH "Path to external Chomp compiler executable")
if (CHOMP_PATH)
  message("Using external Chomp: ${CHOMP_PATH}")
endif()

# any values after ${target} are treated as sources
function(target_chomp_sources target)
  # We cannot use $<CXX_COMPILER_ID:...> because we are not generating binary
  # targets 😢

  set(is-msvc 0)
  set(is-clangcl 0)
  if ("${CMAKE_CXX_COMPILER_ID}" STREQUAL "MSVC")
    set(is-msvc 1)
  elseif("${CMAKE_CXX_COMPILER_ID}" STREQUAL "Clang" AND "${CMAKE_CXX_COMPILER_FRONTEND_VARIANT}" STREQUAL "MSVC")
    set(is-msvc 1)
    set(is-clangcl 1)
  endif()

  set(external-chomp 0)
  if (CHOMP_PATH)
    set(external-chomp 1)
  endif()

  set(include-directories $<TARGET_PROPERTY:${target},INCLUDE_DIRECTORIES>)
  set(compile-definitions $<TARGET_PROPERTY:${target},COMPILE_DEFINITIONS>)
  string(CONCAT include-directories $<
    $<BOOL:${include-directories}>:
    -I$<JOIN:$<REMOVE_DUPLICATES:${include-directories}>,$<SEMICOLON>-I>
  >)
  string(CONCAT compile-definitions $<
    $<BOOL:${compile-definitions}>:
    -D$<JOIN:$<REMOVE_DUPLICATES:${compile-definitions}>,$<SEMICOLON>-D>
  >)
  foreach(source IN LISTS ARGN)
    cmake_path(GET source FILENAME filename)
    cmake_path(REPLACE_EXTENSION filename LAST_ONLY ".chk" OUTPUT_VARIABLE output)
    # Because of how files are laid out, we need to do the following line twice
    # but operate on the resulting path
    cmake_path(GET source PARENT_PATH parent)
    target_include_directories(${target} PRIVATE ${parent})
    cmake_path(GET parent PARENT_PATH parent)
    target_include_directories(${target} PRIVATE ${parent})
    file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/chomp/${target}")
    set(output "${CMAKE_CURRENT_BINARY_DIR}/chomp/${target}/${output}")
    set(processed "${CMAKE_CURRENT_BINARY_DIR}/chomp/${target}/${filename}.i")
    add_custom_command(
      OUTPUT "${processed}"
      COMMAND "${CMAKE_CXX_COMPILER}"
        "$<${is-msvc}:/nologo>"
        "$<${is-msvc}:/C>"
        "$<${is-msvc}:/W4>"
        "$<${is-msvc}:/WX>"
        "$<${is-msvc}:/E>"
        "$<${is-msvc}:/TP>"
        "$<${is-clangcl}:/clang:-fuse-line-directives>"
        "${include-directories}"
        "${compile-definitions}"
        "${source}" > "${processed}"
      IMPLICIT_DEPENDS CXX "${source}"
      MAIN_DEPENDENCY "${source}"
      COMMENT "Preprocessing ${source}"
      COMMAND_EXPAND_LISTS
      USES_TERMINAL
      VERBATIM)
    add_custom_command(
      OUTPUT "${output}"
      COMMAND $<IF:${external-chomp},${CHOMP_PATH},$<TARGET_FILE:chomp>> /c  "${processed}" "${output}"
      COMMENT "Chompin' ${processed}"
      MAIN_DEPENDENCY "${processed}"
      WORKING_DIRECTORY "${parent}"
      COMMAND_EXPAND_LISTS
      VERBATIM)
    set_property(TARGET "${target}" APPEND PROPERTY CHOMPED_CHUNKS "${output}")
  endforeach()
  add_custom_target(${target}-chomp-chunks
    DEPENDS $<TARGET_PROPERTY:${target},CHOMPED_CHUNKS>)
  add_dependencies(${target} ${target}-chomp-chunks)
endfunction()