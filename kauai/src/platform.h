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

#endif //! PLATFORM_H
