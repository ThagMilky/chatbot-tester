(function () {
  "use strict";

  const STORAGE_KEY = "chatbot-tester-language";
  const entries = [
    ["QA workspaces", "Không gian QA"], ["Chat", "Trò chuyện"], ["AI Simulator", "Mô phỏng AI"],
    ["Replay", "Phát lại"], ["Regression", "Regression"], ["Scenarios", "Kịch bản"],
    ["Debug", "Debug"], ["History", "Lịch sử"], ["Conversation Library", "Thư viện hội thoại"],
    ["Not configured", "Chưa cấu hình"], ["Ready", "Sẵn sàng"], ["Global chat settings", "Cài đặt chat chung"],
    ["Switch to dark theme", "Chuyển sang giao diện tối"], ["Switch to light theme", "Chuyển sang giao diện sáng"],
    ["Local only", "Chỉ lưu cục bộ"], ["Recent Chat History", "Lịch sử chat gần đây"],
    ["Select all", "Chọn tất cả"], ["Clear selection", "Bỏ chọn"], ["Export selected JSON", "Xuất JSON đã chọn"],
    ["Clear history", "Xóa lịch sử"],
    ["Saved in this browser only. Select conversations to export their transcripts and any stored Scenario/AI QA results. Continue chat reuses the saved session ID; backend session retention depends on the bot API.", "Chỉ lưu trên trình duyệt này. Chọn các hội thoại để xuất nội dung và kết quả QA Scenario/AI đã lưu. Tiếp tục chat sẽ dùng lại Session ID đã lưu; thời gian lưu session phụ thuộc API của bot."],
    ["No saved conversations yet.", "Chưa có hội thoại nào được lưu."], ["Saved conversation", "Hội thoại đã lưu"],
    ["Conversation", "Hội thoại"], ["Close", "Đóng"], ["Copy chat", "Sao chép chat"], ["Continue chat", "Tiếp tục chat"],
    ["Local only · Read from Meta", "Chỉ lưu cục bộ · Đọc từ Meta"],
    ["Checking local setup…", "Đang kiểm tra cấu hình cục bộ…"],
    ["Meta token stays on this computer. Fetching never sends a Messenger reply. Saving copies conversations into a private local file.", "Token Meta chỉ lưu trên máy này. Tải dữ liệu không gửi tin nhắn Messenger. Lưu sẽ sao chép hội thoại vào tệp riêng trên máy."],
    ["Load recent conversations", "Tải hội thoại gần đây"], ["Refresh saved library", "Làm mới thư viện đã lưu"],
    ["Saved on this computer", "Đã lưu trên máy này"], ["No local conversations saved.", "Chưa có hội thoại cục bộ."],
    ["Recent Page conversations", "Hội thoại gần đây trên Page"], ["Load conversations to begin.", "Tải hội thoại để bắt đầu."],
    ["Conversation messages", "Tin nhắn hội thoại"], ["Delete local copy", "Xóa bản cục bộ"],
    ["Meta marks outgoing messages as sent by the Page; it does not identify whether a staff member or bot wrote them. Review the reference reply before saving.", "Meta đánh dấu tin nhắn gửi đi là của Page nhưng không cho biết nhân viên hay bot đã viết. Hãy xem lại câu trả lời tham khảo trước khi lưu."],
    ["Choose a conversation.", "Chọn một hội thoại."], ["Save selected test cases", "Lưu các case đã chọn"],
    ["Saved test cases", "Các case đã lưu"], ["Test as", "Kiểm thử bằng"], ["Website", "Website"], ["Messenger", "Messenger"],
    ["AI label untagged", "Gắn nhãn AI cho mục chưa có nhãn"], ["Filter saved test cases", "Lọc case đã lưu"],
    ["Filter by topic, label or client question…", "Lọc theo chủ đề, nhãn hoặc câu hỏi của khách…"],
    ["Before testing, select Cyno Software V2 from the chatbot selector above. Choose whether to send the test as Website or Messenger.", "Trước khi kiểm thử, chọn Cyno Software V2 ở danh sách chatbot phía trên. Chọn gửi test bằng Website hoặc Messenger."],
    ["AI labeling sends the saved client context, test message(s), and Page reply reference to Gemini only when you click a label button. Page replies are never sent to the chatbot during a test.", "Chỉ khi bấm nút gắn nhãn, ngữ cảnh khách hàng, tin nhắn kiểm thử và câu trả lời Page tham khảo đã lưu mới được gửi đến Gemini. Câu trả lời của Page không được gửi cho chatbot trong lúc kiểm thử."],
    ["No saved test cases yet.", "Chưa có case kiểm thử nào."],
    ["Setup", "Thiết lập"], ["Bot & session", "Bot và session"], ["Chatbot", "Chatbot"], ["API URL", "API URL"],
    ["Test mode", "Chế độ kiểm thử"], ["OFF", "TẮT"], ["ON", "BẬT"],
    ["Channel / test mode", "Kênh / chế độ kiểm thử"],
    ["Website giữ contract hiện tại; Messenger gửi thêm quick-reply payload theo adapter.", "Website giữ nguyên contract hiện tại; Messenger gửi thêm quick-reply payload theo adapter."],
    ["Edge test mode", "Chế độ kiểm thử biên"], ["Rapid / duplicate requests", "Gửi nhanh / request trùng"],
    ["Tắt mặc định: khi gửi, input sẽ khóa để tránh request chồng nhau.", "Mặc định tắt: khóa ô nhập khi gửi để tránh các request chồng lặp."],
    ["Reuse messageId khi Duplicate", "Dùng lại messageId khi nhân bản"], ["Session ID", "Session ID"],
    ["Các tin nhắn liên tiếp dùng cùng session này.", "Các tin nhắn liên tiếp sẽ dùng chung session này."],
    ["New Conversation", "Cuộc trò chuyện mới"], ["Clear Chat", "Xóa chat"], ["Phase 2", "Giai đoạn 2"],
    ["Paste Conversation", "Dán hội thoại"], ["Not scanned", "Chưa quét"], ["Messenger transcript", "Nội dung hội thoại Messenger"],
    ["Paste a Messenger transcript here...", "Dán nội dung hội thoại Messenger vào đây..."],
    ["Bot sender names (optional)", "Tên người gửi của bot (không bắt buộc)"],
    ["Scan only parses and previews messages. It does not call the chatbot backend.", "Quét chỉ phân tích và xem trước tin nhắn, không gọi backend chatbot."],
    ["Scan Conversation", "Quét hội thoại"], ["Conversation replay controls", "Điều khiển phát lại hội thoại"],
    ["Run Replay", "Chạy phát lại"], ["Pause", "Tạm dừng"], ["Stop", "Dừng"], ["Retry Failed Turn", "Thử lại lượt lỗi"],
    ["Not run", "Chưa chạy"], ["No parsed messages yet.", "Chưa có tin nhắn nào được phân tích."],
    ["Phase 3", "Giai đoạn 3"], ["Regression Builder", "Tạo kịch bản Regression"], ["No draft", "Chưa có bản nháp"],
    ["Create a reusable client-message scenario from the imported conversation and replay evidence.", "Tạo kịch bản tin nhắn khách hàng có thể dùng lại từ hội thoại đã nhập và dữ liệu phát lại."],
    ["Generate from Conversation / Replay", "Tạo từ hội thoại / phát lại"], ["Scenario name", "Tên kịch bản"],
    ["Scenario ID", "ID kịch bản"], ["Intent assertion (optional)", "Điều kiện intent (không bắt buộc)"],
    ["Known replay intent", "Intent đã biết từ phát lại"], ["State / step assertion (optional)", "Điều kiện trạng thái / bước (không bắt buộc)"],
    ["Known replay state or step", "Trạng thái hoặc bước đã biết từ phát lại"],
    ["Extracted fields assertion (JSON, optional)", "Điều kiện fields trích xuất (JSON, không bắt buộc)"],
    ["Telegram status (optional)", "Trạng thái Telegram (không bắt buộc)"], ["Telegram trigger count (optional)", "Số lần kích hoạt Telegram (không bắt buộc)"],
    ["Behavior expectations", "Kỳ vọng hành vi"], ["(Phase 4 AI evaluation)", "(Đánh giá AI giai đoạn 4)"],
    ["Answer the latest question", "Trả lời câu hỏi mới nhất"], ["Preserve context", "Giữ ngữ cảnh"],
    ["No unnecessary repetition or re-asking known information", "Không lặp lại không cần thiết hoặc hỏi lại thông tin đã biết"],
    ["No contradiction or renegotiation", "Không mâu thuẫn hoặc thương lượng lại"], ["Do not ignore the user question", "Không bỏ qua câu hỏi của người dùng"],
    ["Relevant consultation with necessary caveats", "Tư vấn phù hợp và nêu lưu ý cần thiết"],
    ["At most one primary information request", "Tối đa một yêu cầu thông tin chính"],
    ["No unsupported website inspection or diagnosis claims", "Không khẳng định đã xem hoặc chẩn đoán website khi chưa có căn cứ"],
    ["Contextual contact request without automatic repetition", "Yêu cầu thông tin liên hệ phù hợp ngữ cảnh, không tự động lặp lại"],
    ["Respect explicit need corrections", "Tôn trọng điều chỉnh nhu cầu rõ ràng"], ["Keep scope and feasibility claims bounded", "Giới hạn phạm vi và cam kết khả thi"],
    ["Save Scenario", "Lưu kịch bản"], ["Export JSON", "Xuất JSON"], ["Import generated scenario JSON", "Nhập JSON kịch bản đã tạo"],
    ["Paste exported scenario JSON here...", "Dán JSON kịch bản đã xuất vào đây..."], ["Import JSON", "Nhập JSON"],
    ["Execution status, deterministic assertions, and AI behavior are reported separately. Behavior checks judge only the visible conversation.", "Trạng thái chạy, assertion xác định và hành vi AI được báo cáo riêng. Kiểm tra hành vi chỉ đánh giá nội dung hội thoại hiển thị."],
    ["Regression", "Regression"], ["Test Scenarios", "Chạy kịch bản kiểm thử"], ["Scenario", "Kịch bản"],
    ["Run Scenario", "Chạy kịch bản"], ["Chưa chạy scenario", "Chưa chạy kịch bản"], ["AI Behavior", "Hành vi AI"],
    ["Not requested", "Chưa yêu cầu"], ["Re-evaluate Behavior", "Đánh giá lại hành vi"], ["Exploratory", "Khám phá"],
    ["AI Client Simulator", "Mô phỏng khách hàng bằng AI"],
    ["An AI acts as a realistic client using the selected profile and visible conversation. It does not run deterministic assertions.", "AI đóng vai khách hàng thực tế theo hồ sơ đã chọn và hội thoại đang hiển thị. Chức năng này không chạy assertion xác định."],
    ["Service", "Dịch vụ"], ["Loading services...", "Đang tải dịch vụ..."], ["Loading scenarios...", "Đang tải kịch bản..."],
    ["Difficulty", "Độ khó"], ["Normal", "Bình thường"], ["Challenging", "Thử thách"], ["Max client turns", "Số lượt khách tối đa"],
    ["Start", "Bắt đầu"], ["Shareable output", "Kết quả có thể chia sẻ"], ["Export QA", "Xuất QA"],
    ["QA report format", "Định dạng báo cáo QA"], ["Xuất toàn bộ conversation, request/response, debug và timing của các turn.", "Xuất toàn bộ hội thoại, request/response, debug và thời gian của các lượt chat."],
    ["Conversation", "Hội thoại"], ["Chatbot", "Chatbot"], ["Copy chat", "Sao chép chat"], ["Sẵn sàng", "Sẵn sàng"],
    ["Message", "Tin nhắn"], ["Start a conversation", "Bắt đầu cuộc trò chuyện"],
    ["Enter a message below to test the selected chatbot.", "Nhập tin nhắn bên dưới để kiểm tra chatbot đã chọn."],
    ["Conversation starter options", "Gợi ý bắt đầu hội thoại"], ["Original Page reply", "Câu trả lời gốc của Page"],
    ["Reference", "Tham khảo"], ["Nội dung tin nhắn", "Nội dung tin nhắn"], ["Send as", "Gửi với vai trò"],
    ["Client", "Khách hàng"], ["Staff", "Nhân viên"], ["Nhập tin nhắn...", "Nhập tin nhắn..."],
    ["Press Enter to send · Shift+Enter for a new line", "Enter để gửi · Shift+Enter xuống dòng"], ["Send", "Gửi"],
    ["Backend Debug", "Debug backend"], ["No message sent yet.", "Chưa có tin nhắn nào được gửi."],
    ["Request / turn log", "Nhật ký request / lượt chat"], ["Select a row to view backend details below.", "Chọn một dòng để xem chi tiết backend bên dưới."],
    ["0 turns", "0 lượt"], ["Chưa có turn nào", "Chưa có lượt chat nào"],
    ["Gửi một message để theo dõi request, kết quả và Telegram.", "Gửi tin nhắn để theo dõi request, kết quả và Telegram."],
    ["Turn", "Lượt"], ["Time", "Thời gian"], ["Run / channel", "Lần chạy / kênh"], ["User message", "Tin nhắn người dùng"],
    ["HTTP / result", "HTTP / kết quả"], ["Response", "Phản hồi"], ["Intent", "Intent"], ["Step", "Bước"], ["Telegram", "Telegram"],
    ["Request and turn history, newest turns first", "Lịch sử request và lượt chat, lượt mới nhất trước"],
    ["HTTP status", "Trạng thái HTTP"], ["Client response time", "Thời gian phản hồi"],
    ["Request không thêm test-mode flag.", "Request does not add a test-mode flag."],
    ["Telegram dry-run", "Telegram chạy thử"], ["Không gửi yêu cầu lên chatbot.", "No request is sent to the chatbot."],
    ["Tắt mặc định: request nhanh/trùng chỉ dùng để QA, backend cần idempotency.", "Off by default: rapid/duplicate requests are for QA only; the backend should be idempotent."],
    ["Messenger mode", "Chế độ Messenger"], ["Website mode", "Chế độ Website"],
    ["Chưa có chatbot", "No chatbot selected"], ["Chưa chọn bot", "No bot selected"],
    ["Chưa cấu hình API URL trong config.js", "API URL is not configured in config.js"],
    ["Chưa có bot enabled trong config.js.", "No enabled bot in config.js."],
    ["Chưa có bot enabled", "No enabled bot"], ["Sẵn sàng", "Ready"],
    ["Đang gửi...", "Sending..."], ["Send", "Send"], ["Đang gửi {count}...", "Sending {count}..."],
    ["Đang gửi {count} request", "Sending {count} requests"], ["Đang gửi", "Sending"],
    ["History entry không còn tồn tại.", "History entry no longer exists."],
    ["Hãy đợi lượt chat hiện tại kết thúc rồi thử lại.", "Wait for the current chat turn to finish, then try again."],
    ["Bot của conversation này không còn được bật trong config.js.", "The bot for this conversation is no longer enabled in config.js."],
    ["Đã khôi phục conversation. Tin nhắn mới sẽ dùng session ID đã lưu.", "Conversation restored. New messages will use the saved session ID."],
    ["History entry deleted.", "Đã xóa mục lịch sử."], ["History cleared.", "Đã xóa lịch sử."],
    ["Turn này chưa có request để copy.", "This turn has no request to copy."],
    ["Không tìm thấy dữ liệu turn để gửi lại.", "Could not find turn data to resend."],
    ["Đang có request chạy. Bật Edge test mode nếu muốn gửi song song.", "A request is in progress. Enable Edge test mode to send in parallel."],
    ["Nội dung chỉnh sửa không được để trống.", "Edited content cannot be empty."],
    ["Open", "Mở"], ["Delete", "Xóa"], ["Duplicate", "Nhân bản"], ["Copy", "Sao chép"], ["Export", "Xuất"],
    ["Replay comparison", "So sánh phát lại"], ["Resume", "Tiếp tục"], ["No parsed messages yet.", "Chưa có tin nhắn nào được phân tích."],
    ["Replay completed.", "Đã phát lại xong."], ["Replay failed at turn {turn}. Retry the failed turn to continue.", "Phát lại lỗi ở lượt {turn}. Hãy thử lại lượt lỗi để tiếp tục."],
    ["Replay helpers are not available.", "Không có công cụ hỗ trợ phát lại."],
    ["No imported client messages are available for replay.", "Không có tin nhắn khách hàng đã nhập để phát lại."],
    ["Replay started with a fresh session.", "Đã bắt đầu phát lại bằng session mới."],
    ["Replay paused. No next turn will start.", "Đã tạm dừng phát lại. Lượt tiếp theo sẽ không bắt đầu."],
    ["Replay stopped. Remaining turns were not sent.", "Đã dừng phát lại. Các lượt còn lại chưa được gửi."],
    ["Retry failed at turn {turn}.", "Thử lại lượt {turn} không thành công."],
    ["Replay completed after retry.", "Phát lại hoàn tất sau khi thử lại."],
    ["Failed turn retried. Resume to continue replay.", "Đã thử lại lượt lỗi. Bấm tiếp tục để phát lại."],
    ["Chưa có pipeline data", "No pipeline data yet"], ["Chưa có payload", "No payload yet"],
    ["Reason: {reason}", "Lý do: {reason}"], ["Chưa có request", "No request yet"],
    ["Chưa có extracted fields", "No extracted fields yet"], ["Chưa có response", "No response yet"], ["Chưa có reply", "No reply yet"],
    ["ACTIVE", "ĐANG HOẠT ĐỘNG"], ["INACTIVE", "KHÔNG HOẠT ĐỘNG"],
    ["Simulator unavailable", "Trình mô phỏng hiện không khả dụng"],
    ["Resume", "Tiếp tục"], ["Select an available AI Client Simulator scenario first.", "Trước tiên hãy chọn một kịch bản AI Client Simulator khả dụng."],
    ["AI Client Simulator started with a fresh session.", "AI Client Simulator đã bắt đầu bằng session mới."],
    ["AI Client Simulator paused.", "Đã tạm dừng AI Client Simulator."], ["AI Client Simulator stopped.", "Đã dừng AI Client Simulator."],
    ["Scenario saved locally.", "Đã lưu kịch bản trên máy."], ["Scenario was not saved.", "Chưa lưu được kịch bản."],
    ["Scenario JSON imported locally.", "Đã nhập JSON kịch bản vào máy."], ["Scenario JSON was rejected.", "JSON kịch bản không hợp lệ."],
    ["Scenario was not exported.", "Chưa xuất được kịch bản."],
    ["Regression draft generated. Review it before saving.", "Đã tạo bản nháp Regression. Hãy xem lại trước khi lưu."],
    ["Could not generate regression scenario.", "Không thể tạo kịch bản Regression."],
    ["Chưa có scenario hợp lệ trong config.js.", "No valid scenario in config.js."],
    ["Scenario không tìm thấy bot {botId}.", "Scenario could not find bot {botId}."],
    ["Đã export QA report dạng {format}.", "Exported QA report as {format}."],
    ["Đã export {count} cuộc trò chuyện đã chọn.", "Exported {count} selected conversations."],
    ["Đã tạo conversation và session mới.", "Created a new conversation and session."],
    ["Đã clear chat. Session ID được giữ nguyên.", "Chat cleared. Session ID was preserved."],
    ["Không copy tự động được; Session ID đã được chọn.", "Could not copy automatically; the Session ID has been selected."],
    ["Wait for the current chat, replay, or simulation to finish before running this case.", "Hãy đợi chat, phát lại hoặc mô phỏng hiện tại kết thúc trước khi chạy case này."],
    ["Chọn chatbot có API trước khi chạy ca test.", "Select a chatbot with an API before running this test case."],
    ["Add at least one client message before running this case.", "Thêm ít nhất một tin nhắn khách hàng trước khi chạy case này."],
    ["Không có phản hồi Page kế tiếp trong dữ liệu gốc.", "No following Page reply in the source data."], ["Trả lời từ Page", "Page reply"],
    ["Journey stopped after client message {turn} because the bot request failed.", "Hành trình đã dừng sau tin nhắn khách hàng thứ {turn} do request bot thất bại."],
    ["Meta configured · Page {pageId} · AI labels ready", "Meta đã cấu hình · Page {pageId} · Sẵn sàng gắn nhãn AI"],
    ["AI key missing", "Thiếu khóa AI"], ["Local tester server unavailable", "Máy chủ tester cục bộ không khả dụng"],
    ["No recent conversations loaded.", "Chưa tải hội thoại gần đây."], ["No local conversations saved.", "Chưa có hội thoại cục bộ."],
    ["No text messages from the client in this conversation.", "Hội thoại này không có tin nhắn dạng văn bản từ khách hàng."],
    ["Loading conversation messages…", "Đang tải tin nhắn hội thoại…"], ["Loading local conversation…", "Đang tải hội thoại cục bộ…"],
    ["One client message per line", "Mỗi dòng một tin nhắn khách hàng"],
    ["One client message per line. Messages are sent in order within one fresh session.", "Mỗi dòng một tin nhắn khách hàng. Tin nhắn được gửi theo thứ tự trong cùng một session mới."],
    ["Save this client question", "Lưu câu hỏi này của khách hàng"], ["Save test case", "Lưu case kiểm thử"],
    ["Client question", "Câu hỏi của khách hàng"], ["Next Page message (review: may be staff or bot)", "Tin nhắn tiếp theo từ Page (có thể do nhân viên hoặc bot gửi)"],
    ["No following Page message", "Không có tin nhắn Page tiếp theo"], ["Single message", "Một tin nhắn"],
    ["Journey (sequential messages)", "Hành trình (các tin nhắn theo thứ tự)"], ["Category", "Danh mục"],
    ["Page reply reference", "Câu trả lời Page tham khảo"], ["Ordered client seed messages", "Các tin nhắn đầu vào của khách theo thứ tự"],
    ["Test case type", "Loại case kiểm thử"], ["Page reply reference (reference only)", "Câu trả lời Page tham khảo (chỉ dùng để đối chiếu)"],
    ["Save edits", "Lưu chỉnh sửa"], ["AI label", "Gắn nhãn AI"], ["Test this question", "Kiểm thử câu hỏi này"],
    ["Add at least one client message.", "Thêm ít nhất một tin nhắn khách hàng."],
    ["Sending this selected question and Page reply for AI labeling…", "Đang gửi câu hỏi đã chọn và câu trả lời Page để AI gắn nhãn…"],
    ["Saved local edits.", "Đã lưu chỉnh sửa cục bộ."], ["AI label saved locally. Review the category and tags.", "Đã lưu nhãn AI trên máy. Hãy kiểm tra danh mục và thẻ."],
    ["Edits saved; AI label failed: ", "Đã lưu chỉnh sửa; gắn nhãn AI thất bại: "], ["Deleted local test case.", "Đã xóa case kiểm thử cục bộ."],
    ["AI labeling sends the saved client context, test message(s), and Page reply reference to Gemini only when you click a label button.", "Chỉ khi bấm nút gắn nhãn, ngữ cảnh khách hàng, tin nhắn kiểm thử và câu trả lời Page tham khảo đã lưu mới được gửi đến Gemini."],
    ["Saved ", "Đã lưu "], [" test case(s) in the local library.", " case kiểm thử vào thư viện cục bộ."],
    ["Saved local conversation.", "Đã lưu hội thoại cục bộ."],
    ["Deleted this local conversation and all its saved test cases? Facebook data will not be changed.", "Xóa hội thoại cục bộ này cùng tất cả case kiểm thử đã lưu? Dữ liệu Facebook sẽ không bị thay đổi."],
    ["Deleted the local conversation and its saved test cases. Meta data was not changed.", "Đã xóa hội thoại cục bộ và các case kiểm thử đã lưu. Dữ liệu Meta không bị thay đổi."],
    ["Send {count} selected test case(s) to Gemini for labeling? This uses AI tokens.", "Gửi {count} case kiểm thử đã chọn đến Gemini để gắn nhãn? Thao tác này dùng token AI."],
    ["AI labeling {current} of {total}…", "Đang gắn nhãn AI {current}/{total}…"],
    ["Finished AI labeling the untagged test cases. Review the suggestions.", "Đã gắn nhãn AI cho các case chưa có nhãn. Hãy kiểm tra đề xuất."],
    ["Delete this local conversation and all its saved test cases? Facebook data will not be changed.", "Xóa hội thoại cục bộ này cùng tất cả case kiểm thử đã lưu? Dữ liệu Facebook sẽ không bị thay đổi."],
    ["Language", "Ngôn ngữ"], ["Vietnamese", "Tiếng Việt"], ["English", "Tiếng Anh"],
    ["Chatbot Tester", "Công cụ kiểm thử Chatbot"], ["Current state / step", "Trạng thái / bước hiện tại"],
    ["Error", "Lỗi"], ["Backend duration", "Thời gian xử lý backend"], ["Human Takeover", "Chuyển cho nhân viên"],
    ["LLM / model", "LLM / model"], ["Extracted fields", "Các trường đã trích xuất"],
    ["Pipeline events / steps", "Sự kiện / bước pipeline"], ["Telegram Mock", "Telegram mô phỏng"],
    ["Notification dry-run", "Chạy thử thông báo"], ["Trigger", "Điều kiện kích hoạt"], ["Payload", "Payload"],
    ["Raw backend response", "Phản hồi thô từ backend"], ["Parsed reply", "Phản hồi đã phân tích"], ["Stack trace (local/dev only)", "Stack trace (chỉ dùng local/dev)"],
    ["Request payload", "Payload request"], ["Status", "Trạng thái"], ["No saved conversations yet.", "Chưa có hội thoại nào được lưu."],
    ["Chưa có extracted fields", "Chưa có trường nào được trích xuất"],
    ["Chưa có request", "Chưa có request"], ["Chưa có response", "Chưa có phản hồi"], ["Chưa có reply", "Chưa có phản hồi đã phân tích"],
    ["Chưa có scenario trong config.js", "No scenario in config.js"], ["Chưa có turn nào", "No turns yet"],
    ["Chưa chạy", "Not run"], ["Chưa chạy scenario", "Scenario not run"], ["Sẵn sàng", "Ready"],
    ["No behavior expectations are enabled.", "Chưa bật kỳ vọng hành vi nào."],
    ["Run a scenario to request behavior evaluation.", "Chạy kịch bản để yêu cầu đánh giá hành vi."],
    ["Evaluating completed scenario turns...", "Đang đánh giá các lượt của kịch bản đã chạy..."],
    ["Not evaluated because scenario execution did not complete.", "Chưa đánh giá vì kịch bản chưa chạy hoàn tất."],
    ["Behavior evaluation is unavailable.", "Không thể dùng chức năng đánh giá hành vi."],
    ["Behavior evaluation failed safely.", "Đánh giá hành vi gặp lỗi và đã dừng an toàn."],
    ["Execution", "Thực thi"], ["Assertions", "Assertion"], ["Observable expectations", "Kỳ vọng có thể quan sát"],
    ["AI behavior checks are shown separately and never change deterministic assertions.", "Kiểm tra hành vi AI được hiển thị riêng và không làm thay đổi assertion xác định."],
    ["Completed", "Hoàn tất"], ["Stopped at turn", "Dừng tại lượt"], ["Running", "Đang chạy"],
    ["{state} {current}/{total} turns", "{state} {current}/{total} lượt"],
    ["Completed {count}/{total} turns", "Hoàn tất {count}/{total} lượt"],
    ["Stopped at turn {current}/{total}", "Dừng tại lượt {current}/{total}"],
    ["Select all", "Chọn tất cả"], ["Select conversation for export: {preview}", "Chọn hội thoại để xuất: {preview}"],
    ["Role for parsed message {index}", "Vai trò của tin nhắn đã phân tích {index}"],
    ["Edit parsed {role} message {index}", "Sửa tin nhắn {role} đã phân tích {index}"],
    ["Delete parsed message {index}", "Xóa tin nhắn đã phân tích {index}"],
    ["{count} message", "{count} tin nhắn"], ["{count} messages", "{count} tin nhắn"],
    ["{count} turn", "{count} lượt"], ["{count} turns", "{count} lượt"],
    ["Open", "Mở"], ["Copy this bot reply", "Sao chép phản hồi này của bot"], ["Suggested replies", "Câu trả lời gợi ý"],
    ["Role", "Vai trò"], ["Website", "Website"], ["Messenger", "Messenger"],
    ["Select a scenario", "Chọn kịch bản"], ["Scenario execution complete", "Đã chạy xong kịch bản"],
    ["Assertions NOT EVALUATED", "Assertion CHƯA ĐƯỢC ĐÁNH GIÁ"], ["Execution PASS", "Thực thi ĐẠT"],
    ["Execution FAIL", "Thực thi LỖI"], ["Execution {execution} · Assertions {assertions}", "Thực thi {execution} · Assertion {assertions}"],
    ["AI Behavior · {status}", "Hành vi AI · {status}"], ["PASS", "ĐẠT"], ["FAIL", "LỖI"],
    ["Scenario execution failed at message {turn}.", "Chạy kịch bản thất bại tại tin nhắn {turn}."],
    ["Scenario execution complete · assertions {status}.", "Đã chạy xong kịch bản · assertion {status}."],
    ["Đang chạy {current}/{total}", "Running {current}/{total}"],
    ["Dừng tại turn {current}/{total} turns", "Stopped at turn {current}/{total} turns"],
    ["Hoàn tất {current}/{total} turns", "Completed {current}/{total} turns"],
    ["Đã chạy {current}/{total} turns", "Ran {current}/{total} turns"],
    ["Loaded {count} recent conversation(s). Choose one to import locally.", "Đã tải {count} hội thoại gần đây. Chọn một hội thoại để nhập vào máy."],
    ["Conversation saved locally{detail}. Page messages may come from staff or bot; review before using as reference.", "Đã lưu hội thoại cục bộ{detail}. Tin nhắn Page có thể do nhân viên hoặc bot gửi; hãy xem lại trước khi dùng làm tham khảo."],
    ["Loaded saved data from this computer; no Meta request was made.{detail}", "Đã tải dữ liệu lưu trên máy; không gửi request đến Meta.{detail}"],
    ["Deleted local test case.", "Đã xóa case kiểm thử cục bộ."],
    ["Saved {count} test case(s) in the local library.", "Đã lưu {count} case kiểm thử vào thư viện cục bộ."],
    ["Sending {count} selected test case(s) to Gemini for labeling? This uses AI tokens.", "Gửi {count} case kiểm thử đã chọn đến Gemini để gắn nhãn? Thao tác này dùng token AI."],
    ["AI labeling {current} of {total}…", "Đang gắn nhãn AI {current}/{total}…"],
    ["No client messages available", "Không có tin nhắn khách hàng nào"],
    ["Export selected conversations", "Xuất hội thoại đã chọn"], ["Clear selection", "Bỏ chọn"],
    ["Save this client question", "Lưu câu hỏi này của khách hàng"], ["Test case type", "Loại case kiểm thử"],
    ["Single message", "Một tin nhắn"], ["Journey (sequential messages)", "Hành trình (các tin nhắn theo thứ tự)"],
    ["Client question {index}", "Câu hỏi khách hàng {index}"],
    ["Saved test cases", "Các case kiểm thử đã lưu"], ["No saved test cases yet.", "Chưa có case kiểm thử nào."],
    ["Conversation messages", "Tin nhắn hội thoại"], ["Choose a conversation.", "Chọn một hội thoại."],
    ["Cần MESSENGER_PAGE_ID và MESSENGER_PAGE_ACCESS_TOKEN trong .env của chatbot-tester.", "MESSENGER_PAGE_ID and MESSENGER_PAGE_ACCESS_TOKEN are required in chatbot-tester's .env."],
    ["Meta đã cấu hình. AI labeling cần GEMINI_API_KEY trong local .env.", "Meta is configured. AI labeling requires GEMINI_API_KEY in the local .env."],
    ["Meta và AI label đã cấu hình. Dữ liệu chỉ tải khi bạn bấm nút.", "Meta and AI labeling are configured. Data is fetched only when you click a button."],
    ["Đang tải hội thoại gần đây…", "Loading recent Page conversations…"],
    ["Đang đọc hội thoại từ Meta…", "Reading conversation from Meta…"],
    ["Intent: {intent} · {replyType}", "Intent: {intent} · {replyType}"], ["Chưa gắn nhãn AI", "Not AI labeled yet"],
    ["Add at least one client message before testing.", "Thêm ít nhất một tin nhắn khách hàng trước khi kiểm thử."],
    ["Đã lưu hội thoại cục bộ", "Conversation saved locally"],
    ["Chưa có hội thoại nào được lưu.", "No saved conversations yet."],
    ["{count} messages · more messages available · saved {date}", "{count} tin nhắn · còn tin nhắn khác · đã lưu {date}"],
    ["{count} messages · saved {date}", "{count} tin nhắn · đã lưu {date}"],
    ["Saved conversation …{id}", "Hội thoại đã lưu …{id}"],
    ["Selection sent no text message from the client.", "Hội thoại đã chọn không có tin nhắn văn bản từ khách hàng."],
  ];

  const catalog = { vi: {}, en: {} };
  entries.forEach(function (entry) {
    const firstIsVietnamese = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(entry[0]);
    const vi = firstIsVietnamese ? entry[0] : entry[1];
    const en = firstIsVietnamese ? entry[1] : entry[0];
    catalog.vi[entry[0]] = vi;
    catalog.vi[entry[1]] = vi;
    catalog.en[entry[0]] = en;
    catalog.en[entry[1]] = en;
  });

  function translateSource(source, language) {
    if (Object.prototype.hasOwnProperty.call(catalog[language], source)) return catalog[language][source];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const firstIsVietnamese = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(entry[0]);
      const viTemplate = firstIsVietnamese ? entry[0] : entry[1];
      const enTemplate = firstIsVietnamese ? entry[1] : entry[0];
      const targetTemplate = language === "vi" ? viTemplate : enTemplate;
      const sourceTemplates = [entry[0], entry[1]].filter(function (template) { return template.includes("{"); });
      if (!sourceTemplates.length) continue;
      const names = [];
      let match = null;
      sourceTemplates.some(function (sourceTemplate) {
        names.length = 0;
        const pattern = sourceTemplate.replace(/[.*+?^$()|[\]\\]/gu, "\\$&").replace(/\{([^}]+)\}/gu, function (_match, name) {
          names.push(name);
          return "(.+?)";
        });
        match = new RegExp("^" + pattern + "$", "u").exec(source);
        return Boolean(match);
      });
      if (!match) continue;
      let result = targetTemplate;
      names.forEach(function (name, valueIndex) {
        result = result.replace("{" + name + "}", match[valueIndex + 1]);
      });
      return result;
    }
    return source;
  }

  function getLanguage() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi";
    } catch (error) {
      return "vi";
    }
  }

  function t(key, values) {
    const language = getLanguage();
    let result = translateSource(key, language) || key;
    Object.keys(values || {}).forEach(function (name) {
      result = result.replace(new RegExp("\\{" + name + "\\}", "gu"), String(values[name]));
    });
    return result;
  }

  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();

  function isDataContent(node) {
    const parent = node.parentElement;
    if (parent && parent.closest(".i18n-ui")) return true;
    return !parent || Boolean(parent.closest(
      "#chat-messages, #scenario-select, #simulator-scenario, #scenario-result, #ai-behavior-result, #simulator-summary, #conversation-preview, " +
      "#history-transcript, .history-entry-title, .history-entry-meta, .messenger-case-meta, .messenger-case-labels, .messenger-pair-text, #messenger-conversation-list, " +
      "#messenger-saved-conversations, #request-json, #raw-response, #parsed-reply, #debug-message-label, #debug-error, #debug-stack, #debug-status, #debug-intent, #debug-step, #debug-fields, #turn-log-body, .debug-value, pre, code, textarea"
    ));
  }

  function translateTextNode(node, language) {
    if (!isDataContent(node) || !node.nodeValue || !node.nodeValue.trim()) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const value = translateSource(source, language);
    if (node.nodeValue !== value) node.nodeValue = value;
  }

  function translateAttribute(element, attribute, language) {
    if (element.closest("#scenario-select, #simulator-scenario, #scenario-result, #ai-behavior-result, #simulator-summary, #history-transcript, .history-entry-title, .history-entry-meta, .messenger-case-meta, .messenger-case-labels, .messenger-pair-text, pre, code")) return;
    let values = originalAttributes.get(element);
    if (!values) {
      values = {};
      originalAttributes.set(element, values);
    }
    if (!Object.prototype.hasOwnProperty.call(values, attribute)) values[attribute] = element.getAttribute(attribute);
    const source = values[attribute];
    const value = source && translateSource(source, language);
    if (value && source !== value && element.getAttribute(attribute) !== value) {
      element.setAttribute(attribute, value);
    }
  }

  function applyStaticTranslations() {
    const language = getLanguage();
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      const key = element.getAttribute("data-i18n");
      if (!element.dataset.i18nSource) element.dataset.i18nSource = element.textContent;
      element.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]").forEach(function (element) {
      [["placeholder", "data-i18n-placeholder"], ["title", "data-i18n-title"], ["aria-label", "data-i18n-aria-label"]].forEach(function (pair) {
        const key = element.getAttribute(pair[1]);
        if (key) element.setAttribute(pair[0], t(key));
      });
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateTextNode(walker.currentNode, language);
    document.querySelectorAll("[placeholder], [title], [aria-label]").forEach(function (element) {
      ["placeholder", "title", "aria-label"].forEach(function (attribute) {
        if (element.hasAttribute(attribute)) translateAttribute(element, attribute, language);
      });
    });
    document.querySelectorAll("[data-language]").forEach(function (button) {
      const active = button.dataset.language === language;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("active", active);
    });
  }

  function setLanguage(language) {
    if (language !== "vi" && language !== "en") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch (error) {
      // Language selection still applies for this page when storage is unavailable.
    }
    applyStaticTranslations();
    document.dispatchEvent(new CustomEvent("chatbot-tester:languagechange", { detail: { language: language } }));
  }

  window.ChatbotTesterI18n = { getLanguage: getLanguage, setLanguage: setLanguage, t: t, applyStaticTranslations: applyStaticTranslations };

  document.addEventListener("DOMContentLoaded", function () {
    const controls = document.querySelectorAll("[data-language]");
    controls.forEach(function (button) {
      button.addEventListener("click", function () { setLanguage(button.dataset.language); });
    });
    applyStaticTranslations();
    const observer = new MutationObserver(function (mutations) {
      const language = getLanguage();
      mutations.forEach(function (mutation) {
        if (mutation.type === "characterData") translateTextNode(mutation.target, language);
        if (mutation.type === "childList") mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) translateTextNode(walker.currentNode, language);
            ["placeholder", "title", "aria-label"].forEach(function (attribute) {
              if (node.hasAttribute(attribute)) translateAttribute(node, attribute, language);
            });
            node.querySelectorAll("[placeholder], [title], [aria-label]").forEach(function (element) {
              ["placeholder", "title", "aria-label"].forEach(function (attribute) {
                if (element.hasAttribute(attribute)) translateAttribute(element, attribute, language);
              });
            });
          }
        });
        if (mutation.type === "attributes") translateAttribute(mutation.target, mutation.attributeName, language);
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
  });
})();
