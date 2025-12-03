# 🚀 SoftGate Frontend Development Plan

**Project:** SoftGate (Custom FaaS Console)

**Timeline:** 5 Days

**Goal:** 백엔드의 "비동기 큐 & 격리 아키텍처"를 시각적으로 증명하는 개발자 중심의 웹 콘솔 구축

## 📅 Day 1: Foundation & Layout

### Phase 1: 프로젝트 초기 세팅 및 레이아웃 구조화

* **Description:** Next.js 프로젝트를 생성하고, Tailwind CSS와 Shadcn UI를 설치하여 기본 스타일 시스템을 구축한다. 전체 화면을 3단 레이아웃(Sidebar, Main, Right Panel)으로 분할한다.

* **Estimated Time:** 4 Hours

* **Acceptance Criteria:**

  * [✓] 프로젝트가 에러 없이 로컬에서 실행된다.

  * [✓] Tailwind CSS 및 Shadcn UI(Button, Input, Card 등)가 정상 작동한다.

  * [✓] 화면이 좌측(20%), 중앙(50%), 우측(30%) 영역으로 정확히 분할되어 보인다.

  * [✓] 브라우저 창 크기를 조절해도 레이아웃이 깨지지 않는다 (Responsive).

### Phase 2: 좌측 패널 - 함수 목록 UI (Mock Data)

* **Description:** 사용자가 생성한 함수 리스트를 보여주는 사이드바를 구현한다. 아직 백엔드 연동 전이므로 Mock Data(가짜 데이터)를 사용하여 렌더링한다.

* **Estimated Time:** 3 Hours

* **Acceptance Criteria:**

  * [✓] '함수 생성(+)' 버튼이 상단에 배치되어 있다.

  * [✓] 함수 리스트에 언어 아이콘(Python, Node, Go)과 함수 이름이 표시된다.

  * [✓] 리스트 항목을 클릭하면 해당 항목이 '선택된 상태(Active)'가 되며 하이라이트된다.

## 📅 Day 2: The Core Editor

### Phase 3: 중앙 패널 - Monaco Editor 연동

* **Description:** @monaco-editor/react 라이브러리를 사용하여 웹 브라우저 상에 VS Code와 유사한 코드 편집 환경을 구축한다.

* **Estimated Time:** 5 Hours

* **Acceptance Criteria:**

  * [✓] 중앙 패널에 코드 에디터가 렌더링된다.

  * [✓] 기본적인 문법 강조(Syntax Highlighting)가 작동한다.

  * [✓] 상단의 '언어 선택 드롭다운'을 변경하면 에디터의 언어 모드도 즉시 변경된다 (예: Python -> JavaScript).

  * [✓] 에디터에 코드를 입력하고 수정할 수 있다.

### Phase 4: 에디터 상태 관리 (State Management)

* **Description:** 좌측 사이드바에서 다른 함수를 선택했을 때, 에디터의 내용(코드)과 선택된 언어가 올바르게 바뀌도록 상태 관리(Zustand 또는 React Context)를 구현한다.

* **Estimated Time:** 3 Hours

* **Acceptance Criteria:**

  * [✓] 사이드바에서 A 함수(Python) 클릭 시 A의 코드가 에디터에 뜬다.

  * [✓] 사이드바에서 B 함수(Node.js) 클릭 시 B의 코드로 전환된다.

  * [✓] '저장(Save)' 버튼을 누르면 현재 에디터의 내용이 콘솔에 로그로 출력된다 (추후 API 연동).

## 📅 Day 3: Execution UI & Logic

### Phase 5: 우측 패널 - 입력(Input) 및 실행 제어

* **Description:** 함수 실행에 필요한 입력값(JSON)을 설정하는 에디터와 실행 버튼을 구현한다. JSON 포맷 유효성 검사가 포함되어야 한다.

* **Estimated Time:** 4 Hours

* **Acceptance Criteria:**

  * [ ] 우측 패널 상단에 JSON 입력 전용 에디터(또는 텍스트 영역)가 있다.

  * [ ] 유효하지 않은 JSON을 입력하고 실행 시도 시 경고 메시지가 뜬다.

  * [ ] '실행(Run)' 버튼이 눈에 띄게 배치되어 있다.

  * [ ] 실행 버튼 클릭 시 버튼이 '로딩 중(Loading)' 상태로 변하고 비활성화된다.

### Phase 6: 우측 패널 - 결과 출력 탭 구성

* **Description:** 실행 결과를 보여줄 '결과(Output)' 탭과 과거 기록을 보여줄 '이력(History)' 탭 UI를 잡는다.

* **Estimated Time:** 3 Hours

* **Acceptance Criteria:**

  * [ ] 탭 전환(Output <-> History)이 부드럽게 작동한다.

  * [ ] Output 탭에는 상태 배지(Status Badge), 로그(Log), 결과값(Result) 영역이 구분되어 있다.

  * [ ] History 탭에는 더미 리스트가 테이블 형태로 표시된다.

## 📅 Day 4: Async Integration (The "Magic")

### Phase 7: API 연동 - 실행 요청 및 비동기 Polling 구현

* **Description:** (가장 중요) POST /run으로 작업을 큐에 넣고, job_id를 받아 GET /status/{job_id}를 1초마다 호출(Polling)하여 상태를 추적하는 로직을 구현한다.

* **Estimated Time:** 4 Hours

* **Acceptance Criteria:**

  * [ ] 실행 버튼 클릭 시 POST 요청이 성공적으로 전송된다.

  * [ ] 응답받은 job_id를 이용해 폴링이 시작된다.

  * [ ] 최종 상태가 Success가 되면 폴링이 멈추고 결과값이 화면에 표시된다.

### Phase 8: 실행 상태 시각화

* **Description:** 실행 버튼을 누르면 "대기 중(Queued)" -> "실행 중(Running)" -> "완료(Success)" 로 상태가 변하는 배지(Badge)나 스피너

* **Estimated Time:** 2 Hours

* **Acceptance Criteria:**

  * [ ] 폴링 상태에 따라 UI 배지가 Queued -> Processing -> Success/Fail 순서로 실시간 변경된다.  

  * [ ] 실행 완료 시, 실행 시간(ms)이 표시된다.

## 📅 Day 5: Polish & Final Review

### Phase 9: 함수 저장 및 목록 연동 (CRUD)

* **Description:** Mock Data를 걷어내고 실제 백엔드 API를 통해 함수 목록을 불러오고(GET), 작성한 코드를 저장(PUT/POST)한다.

* **Estimated Time:** 4 Hours

* **Acceptance Criteria:**

  * [ ] 새로고침 해도 작성한 코드가 유지된다(DB 저장 확인).

  * [ ] 새로운 함수를 생성하면 목록에 즉시 반영된다.

  * [ ] 코드를 수정하고 저장 버튼을 누르면 "저장되었습니다" 토스트 알림이 뜬다.

### Phase 10: 최종 UI 다듬기 및 데모 리허설 준비

* **Description:** 폰트, 간격, 컬러 등 디자인 디테일을 수정하고 예외 처리(서버 다운 등)를 추가한다. 데모 시연을 위한 시나리오를 점검한다.

* **Estimated Time:** 4 Hours

* **Acceptance Criteria:**

  * [ ] 서버 에러 발생 시 사용자에게 적절한 에러 메시지가 표시된다.

  * [ ] 빈 상태(Empty State) 화면이 구현되어 있다 (함수 선택 안 했을 때 등).

  * [ ] 데모 시나리오(생성 -> 코드작성 -> 실행 -> 큐 대기 -> 결과확인)가 끊김 없이 작동한다.