/**
 * @brief Kauai assert procedures
 **/

#include <gtest/gtest.h>
#include "util.h"

/**
 * @brief Kauai assertion handler that causes a Google Test failure on assert
 *
 * @param pszsFile Source file name
 * @param lwLine Source line number
 * @param pszsMsg Assertion message
 * @param pv Optional data
 * @param cb Size of optional data
 * @return fFalse to not break into the debugger
 */
bool FAssertProc(PSZS pszsFile, int32_t lwLine, PSZS pszsMsg, void *pv, int32_t cb)
{
    ADD_FAILURE_AT(pszsFile, lwLine) << pszsMsg;
    return fFalse;
}

/**
 * @brief Kauai warning log handler
 *
 * @param pszsFile Source file name
 * @param lwLine Source line number
 * @param pszsMsg Warning message
 */
void WarnProc(PSZS pszsFile, int32_t lwLine, PSZS pszsMsg)
{
#ifdef WIN32
    // Log warnings to debugger if attached
    OutputDebugStringA(pszsMsg);
#endif // WIN32
}
