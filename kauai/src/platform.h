/*
 * Platform-specific definitions
 */

#ifndef PLATFORM_H
#define PLATFORM_H

#include <stdint.h>

/****************************************
    Mutex (critical section) object
****************************************/
typedef class MUTX *PMUTX;

class MUTX
{
  protected:
    void *opaque;

  public:
    MUTX(void);
    ~MUTX(void);

    void Enter(void);
    void Leave(void);
};

/****************************************
    Current thread id
****************************************/

uint32_t LwThreadCur(void);

/***************************************************************************
    Universal scalable application clock and other time stuff
***************************************************************************/

extern const uint32_t kdtsSecond;
extern uint32_t TsCurrentSystem(void);
extern uint32_t DtsCaret(void);

/***************************************************************************
    Return a path to a directory to store configuration files
***************************************************************************/
extern bool FGetAppConfigDir(char *psz, int32_t cchMax);

#ifndef WIN
/****************************************
    Current executable name
****************************************/
extern void GetExecutableName(char *psz, int cchMax);

/****************************************
    Get environment variable
****************************************/
extern uint32_t GetEnvironmentVariable(const char *pcszName, char *pszValue, uint32_t cchMax);

/****************************************
    Current username
****************************************/
extern bool GetUserName(char *psz, int cchMax);
#endif

#endif //! PLATFORM_H
