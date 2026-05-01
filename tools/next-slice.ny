;nyquist plug-in
;version 4
;type tool
;name "Next Slice"
;author "Kumbengo Lab"
;release 1.0

(setf labels (second (first (aud-get-info "Labels"))))
(setf now (get '*selection* 'start))

(defun select-region (start end)
  (aud-do (format nil "Select:Start=~a End=~a Mode=Set" start end))
  (aud-do "PlaySelectedRegion:")
  "")

(defun get-label-time (i)
  (first (nth i labels)))

(defun find-current-index ()
  (do ((j 0 (1+ j)))
      ((or (>= j (length labels))
           (>= (get-label-time j) now))
       j)))

(cond
  ((< (length labels) 1)
   "No labels found.")
  (t
   (let ((idx (find-current-index)))
     (if (< idx (length labels))
         (let ((start (get-label-time idx))
               (end (if (< (1+ idx) (length labels))
                        (get-label-time (1+ idx))
                        nil)))
           (if end
               (select-region start end)
               "Already at the last slice"))
         "Already at the last slice"))))
