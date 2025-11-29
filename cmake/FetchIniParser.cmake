include(FetchContent)

FetchContent_Declare(
    iniparser
    GIT_REPOSITORY https://gitlab.com/iniparser/iniparser
    GIT_TAG "main"
    EXCLUDE_FROM_ALL
)

block()
    set(BUILD_DOCS OFF)
    set(BUILD_SHARED_LIBS OFF)
    FetchContent_MakeAvailable(
        iniparser
    )
endblock()
